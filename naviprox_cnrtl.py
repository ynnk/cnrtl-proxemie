#!/usr/bin/env python
#-*- coding:utf-8 -*-

import os
import sys
import json
import logging
from flask import Flask, render_template, url_for, abort

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


#TODO: should mv in cello
#TODO: should add test
from cello.graphs.extraction import VtxMatch
import cello.graphs.prox as prox

class ProxColors(Optionable):
    """ Add color to each vertices of a subgraph.
    Colors are computed from fixed color given of some vertices of a global graph.

    >>> # at init time one can build a graph, a subgraph extractor and a ProxColor isntance:
    >>> import igraph as ig
    >>> g = ig.Graph.Formula("a--b--c--d--e--f--g--h--i--j")
    >>> from cello.graphs.builder import Subgraph
    >>> subgraph_builder = Subgraph(g)
    >>> add_colors = ProxColors(g, colors={"a":(255, 0, 0), "c":(0, 255, 0), "j":(0, 0, 255)}, match_attr=u"name")
    >>> #
    >>> # then online:
    >>> sg = subgraph_builder([0, 2, 4, 6, 9])
    >>> sg = add_colors(sg)
    >>> sg.vs["name"]
    ['a', 'c', 'e', 'g', 'j']
    >>> sg.vs["prox_color"]
    [(255, 95, 0), (191, 255, 0), (0, 255, 0), (0, 0, 255), (0, 0, 255)]

    """
    def __init__(self, graph, colors={}, match_attr=u"label", out_attr="prox_color", length=3, name=None):
        """
        :param graph: gobal graph
        :param colors: dict of label and colors(r,v,b 255)
        :param match_attr: vertex attribute used to identify vertices (from `colors` input dict)
        :param out_attr: vertex attribute used to store computed colors
        :param length: length of the random walks to use to compute subgraph vertices colors
        :param name: name of the component
        """
        super(ProxColors, self).__init__(name)
        # store attributes
        self.graph = graph
        self.colors = colors
        self.out_attr = out_attr
        # compute prox line for each color vertex
        # add store color of each these vertex
        self.plines = {}
        self.vertices_color = {}
        # vertex id in global grah, color as (r,g,b)
        match = VtxMatch(graph, attr_list=[match_attr], default_attr=match_attr)
        extract = prox.prox_markov_dict
        for label, color in colors.iteritems():
            gid, score = match(label).items()[0]
            self.vertices_color[gid] = color
            self.plines[gid] = extract(graph, [gid], length=length, add_loops=True)

    def __call__(self, subgraph):
        colors = []
        for idx, vid in enumerate(subgraph.vs["gid"]):
            cr, cg, cb = (0,0,0) # color in [0,1]
            for cgid, (r, g, b) in self.vertices_color.iteritems():
                value = self.plines[cgid].get(vid, .0)
                cr += r * value
                cg += g * value
                cb += b * value
            maxRVB = float(max(cr, cg, cb))
            if maxRVB > 0:
                cr, cg, cb = [int(255*u) for u in [cr/maxRVB , cg/maxRVB , cb/maxRVB]]
            colors.append((cr,cg,cb))
        subgraph.vs[self.out_attr] = colors
        return subgraph


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
    

    # Pour avoir une recherche "_all"
    # http://localhost:5000/verb/q/_all
    @Composable
    def nothing_if_all(query):
        """ Make the query be nothing if it is '_all'
        """
        if query in ("_all", None):
            return ""   #Note: p0 to [] make start from all vertices
        return query

    # real match search
    match = VtxMatch(graph, attr_list=[u"label"], default_attr=u"label")

    graph_search = nothing_if_all | match
    graph_search |= ProxMarkovExtractionGlobal(graph)
    graph_search |= Subgraph(graph, score_attr="prox", gdeg_attr="gdeg")
    graph_search |= ProxColors(graph, graph['vertices_color'], length=5)
    graph_search.name = "ProxSearch"

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
        "vertices_color": {'casser':(200,255,0),
                          'fixer':  (255,150,0),
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
    #TODO: better index page ?
    return "<a href='www.kodexlab.com'>www.kodexlab.com</a>"

## build and register the CELLO APIs
for gname, config in graphs.iteritems():
    # create a copy of the config
    _config = {}
    _config.update(config)
    # load the graph
    graph_path = _config.pop("path")
    graph = igraph.read(graph_path)
    # copy config into graph attr
    for key, value in _config.iteritems():
        graph[key] = value
    # create the api and register it
    api = naviprox_api(graph, engine_builder=config.get("engine_builder", None))
    app.register_blueprint(api, url_prefix="/%s/api" % gname)


# main entry HTML entry points
@app.route("/<string:gname>/")
@app.route("/<string:gname>/<string:query>")
@app.route("/<string:gname>/q/<string:query>")
def app_graph(gname, query=None):
    root_url = "%s%s/" % (url_for("index"), gname)
    #check gname is a graph else 404 !
    if gname not in graphs:
        abort(404)
    return render_template('index_graph.html', gname=gname, root_url=root_url)


## build other entry point of the app
@app.route("/proxemie/")
@app.route("/proxemie/<string:query>/<string:gname>")
@app.route("/proxemie/<string:query>")
def app_cnrtl(gname='verb', query='causer'):
    if gname in ('verb','verbe'):
        g = 'verb'
    root_url = "%s%s/" % (url_for("index"), gname)
    return render_template('cnrtl.html', query=query, url="%sq/%s" % (root_url, query))


def main():
    ## run the app
    app.run("0.0.0.0")

if __name__ == '__main__':
    sys.exit(main())


