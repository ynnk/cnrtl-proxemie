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

from cello.pipeline import Composable
from cello.options import ValueOption
from cello.utils import urllib2_json_urlopen, urllib2_setup_proxy

from cello.utils.log import get_basic_logger
from cello.export import export_docs
from cello.graphs import export_graph, IN, OUT, ALL
from cello.layout import export_layout
from cello.clustering import export_clustering

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
    graph_search = VtxMatch(graph, attr_list=[u"label"], default_attr=u"label")
    graph_search |= ProxMarkovExtractionGlobal(graph)
    graph_search |= Subgraph(graph, score_attr="prox")
    graph_search.name = "ProxSearch"

    #TODO: add better color to vtx
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
    engine.labelling.set(VertexAsLabel(lambda graph, cluster, vtx: Label(vtx["label"], role="default")))

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
    },
    "noun": {
        "path": os.path.join(BASEDIR, "Graphs/dicosyn/dicosyn/N.dicosyn.pickle"),
    },
    "adj": {
        "path": os.path.join(BASEDIR, "Graphs/dicosyn/dicosyn/A.dicosyn.pickle"),
    },
}

# index page
@app.route("/")
def index():
    return "<a href='www.kodexlab.com'>www.kodexlab.com</a>"

## build and register the CELLO APIs
for gname, config in graphs.iteritems():
    graph = igraph.read(config["path"])
    api = naviprox_api(graph, engine_builder=config.get("engine_builder", None))
    app.register_blueprint(api, url_prefix="/%s/api" % gname)

## build other entry point of the app
@app.route("/cnrtl/")
@app.route("/cnrtl/<string:gname>/<string:query>")
def app_cnrtl(gname='verb', query='causer'):
    return render_template('cnrtl.html', query=query, url="http://localhost:5000/%s/q/%s" % ( gname, query  ))

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


