#!/usr/bin/env python
#-*- coding:utf-8 -*-

import os
import sys
import json
import logging
from flask import Flask
from flask import render_template, url_for, abort

import igraph

from cello.types import Text, Numeric, Datetime
from cello.utils.web import CelloFlaskView

from cello.engine import Engine

from cello.pipeline import Composable, Optionable
from cello.options import ValueOption
from cello.utils import urllib2_json_urlopen, urllib2_setup_proxy

from cello.utils.log import get_basic_logger
from cello.export import export_docs
from cello.graphs import export_graph, IN, OUT, ALL
from cello.layout import export_layout
from cello.clustering import export_clustering

from cello.graphs.extraction import VtxMatch, ProxMarkovExtractionGlobal
import cello.graphs.prox as prox
class ProxColors(Optionable):
    """
     color component 
     set color from a set of color gie to specifiq vertices
     :param igraph: Igraph graph
     :param colors: dict of label and colors(r,v,b 255).
        
    """
    def __init__(self, graph, colors={}, name='ProxColors'):
        Optionable.__init__(self, name)
        self.graph = graph
        self.colors = colors
        self.vertices_color = {}
        
        self.plines = {}
        # vertex id in global grah, color as (r,g,b)
        match = VtxMatch(graph, attr_list=[u"label"], default_attr=u"label")
        extract = prox.prox_markov_dict
        for label, color in colors.iteritems():
            gid, score = match(label).items()[0]
            self.vertices_color[gid] = color
            self.plines[gid] = extract(graph,[gid], length=3 )

    def __call__(self, graph):
        colors = []
        for idx, vid in enumerate(graph.vs["gid"]):
            cr,cg,cb = (0,0,0) # color in [0,1]
            for cgid, (r,g,b) in self.vertices_color.iteritems():
                value = self.plines[cgid].get(vid, .0)
                cr += r * value
                cg += g * value
                cb += b * value
            maxRVB = float(max(cr, cg, cb))
            if maxRVB > 0 :
                cr, cg, cb = [int(255*u) for u in [cr/maxRVB , cg/maxRVB , cb/maxRVB]]
            colors.append((cr,cg,cb))
        graph.vs['prox_color'] = colors
        return graph

def lexical_graph_engine(graph):
    """ Return a default engine over a lexical graph
    """
    # setup
    engine = Engine()
    engine.requires("search", "clustering", "labelling", "layout")
    engine.search.setup(in_name="query", out_name="graph")
    engine.clustering.setup(in_name="graph", out_name="clusters")
    engine.labelling.setup(in_name="clusters", out_name="clusters", hidden=True)
    engine.layout.setup(in_name="graph", out_name="layout")

    ## Search
    from cello.graphs.extraction import VtxMatch, ProxMarkovExtractionGlobal, VertexIds
    from cello.graphs.builder import Subgraph
    #HACK remove the "id" attribute (if any), it enter in conflict when exporting subgraphs to client
    if 'id' in graph.vs.attributes():
        del graph.vs['id']
    
    # little hack pour avoir le global , a virer apres tests si pas besoin
    # http://localhost:5000/verb/q/_all
    def  search(query, *args, **kwargs):
        if query in ("_all", None) :
            return []
        else:
            match = VtxMatch(graph, attr_list=[u"label"], default_attr=u"label")
            return match(query, *args, **kwargs)
            
    graph_search = Composable(search)
    graph_search |= ProxMarkovExtractionGlobal(graph)
    graph_search |= Subgraph(graph, score_attr="prox", gdeg_attr="gdeg")
    graph_search |= ProxColors( graph, graph['vertices_color'] )
    graph_search.name = "ProxSearch"

    #TODO: add better color to vtx 
    # what is better ???
    from cello.graphs.transform import VtxAttr
    graph_search |= VtxAttr(color=[(45, 200, 34), ])

    graph_search.change_option_default("vcount", 50)
    engine.search.set(graph_search)

    ## Clustering
    from cello.graphs.transform import EdgeAttr
    from cello.clustering.common import Infomap, Walktrap
    #RMQ infomap veux un pds, donc on en ajoute un bidon
    walktrap = EdgeAttr(weight=1.) |Walktrap()
    infomap = EdgeAttr(weight=1.) | Infomap()
    engine.clustering.set(walktrap, infomap)

    ## Labelling
    from cello.clustering.labelling.model import Label
    from cello.clustering.labelling.basic import VertexAsLabel
    vertex_from_vtx = lambda graph, cluster, vtx: Label(vtx["label"], role="default", score=vtx["gdeg"])
    engine.labelling.set(VertexAsLabel(vertex_from_vtx))

    ## Layout
    from cello.layout.simple import KamadaKawaiLayout
    from cello.layout.proxlayout import ProxLayoutRandomProj
    from cello.layout.proxlayout import ProxLayoutPCA
    from cello.layout.transform import Shaker
    engine.layout.set(
        ProxLayoutPCA(dim=3) | Shaker(),
        KamadaKawaiLayout(dim=3),
    )
    return engine


def naviprox_api(graph, engine_builder=None, *args, **kwargs):
    """ Build the Cello/Naviprox API over a graph
    """
    # use default engine in cello_guardian.py
    if engine_builder is None:
        engine_builder = lexical_graph_engine
    engine = engine_builder(graph, *args, **kwargs)

    # build the API from this engine
    api = CelloFlaskView(engine)
    api.set_input_type(Text())
    api.add_output("query", lambda x : x.encode('utf8'))
    api.add_output("graph", export_graph)
    api.add_output("layout", export_layout)
    api.add_output("clusters", export_clustering)
    return api

########
## Build the app
app = Flask(__name__)
app.debug = True

logger = get_basic_logger(logging.DEBUG)


try:
    BASEDIR = os.environ["PTDPATH"]
except KeyError:
    BASEDIR = "./"

# descrption des graphes
graphs = {
    "verb": {
        "path": os.path.join(BASEDIR, "Graphs/dicosyn/dicosyn/V.dicosyn.pickle"),
        "vertices_color": {'casser': (255,150,0),
                          'fixer': (200,255,0),
                          'fuir': (50,50,255),
                          'exciter': (255,50,50)},
    },
    "noun": {
        "path": os.path.join(BASEDIR, "Graphs/dicosyn/dicosyn/N.dicosyn.pickle"),
        "vertices_color": {'ruine': (255,150,0),
                          'aspect': (200,255,0),
                          'association': (50,50,255),
                          'passion': (255,50,50)},
    },
    "adj": {
        "path": os.path.join(BASEDIR, "Graphs/dicosyn/dicosyn/A.dicosyn.pickle"),
        "vertices_color": {'fort': (255,150,0),
                          'bon': (200,255,0),
                          'faible': (50,50,255),
                          'mauvais': (255,50,50)},
    },
}

# index page
@app.route("/")
def index():
    return "<a href='www.kodexlab.com'>www.kodexlab.com</a>"

## build and register the CELLO APIs
for gname, config in graphs.iteritems():
    _config = {}
    _config.update(config)
    graph = igraph.read(_config.pop("path"))
    for k,v in _config.iteritems():
        print k,v
        graph[k] = v
    api = naviprox_api(graph, engine_builder=config.get("engine_builder", None))
    app.register_blueprint(api, url_prefix="/%s/api" % gname)

## build other entry point of the app
@app.route("/cnrtl/")
@app.route("/cnrtl/<string:gname>/<string:query>")
def app_cnrtl(gname='verb', query='causer'):
    root_url = "%s%s/" % (url_for("index"), gname)
    return render_template('cnrtl.html', query=query, url="%sq/%s" % (root_url, query))

@app.route("/<string:gname>/")
@app.route("/<string:gname>/<string:query>")
@app.route("/<string:gname>/q/<string:query>")
def app_graph(gname, query=None):
    root_url = "%s%s/" % (url_for("index"), gname)
    #check gname is a graph else 404 !
    if gname not in graphs:
        abort(404)
    return render_template('index_graph.html', gname=gname, root_url=root_url)


def main():
    ## run the app
    app.run("0.0.0.0")

if __name__ == '__main__':
    sys.exit(main())


