//Filename: app.js

define([
  // These are path alias that we configured in our main.js
    'jquery',
    'underscore',
    'backbone',
    'bootstrap',
    // cello
    'cello_core',
    'cello_ui',  // user interface
    'cello_gviz' // graph visualisation 
], function($, _, Backbone, bootstrap, Cello){
// Above we have passed in jQuery, Underscore and Backbone
// They will not be accessible in the global scope

    // indicate if the app is in debug mode or not
    var DEBUG = true;
    Cello.DEBUG = DEBUG;

    //// DEBUG: this un activate the console,
    //// console log  may cause performance issue on small devices
    if(!DEBUG){
        console.log = function() {}
    }


    /**************************************************************************/
    /** The app itself
     * defines models, views, and actions binding all that !
    */
    var App = Backbone.View.extend({
        // the main models, created in create_models()
        models: {},
        // the views, created in create_*_views()
        views: {},

        // base url, note: over riden by info in template
        root_url: "/",

        // state of the app;
        search_results: false, // true if some data are loaded !

        // create the models
        create_models: function(){
            var app = this;

            // create the engine
            app.models.cellist = new Cello.Engine({url: app.root_url+"api"});
            //NOTE: the url is from root, issue comming if "api" entry point is not at root

            // --- Query model ---
            //RMQ why in Cello.ui ?
            //RMQ: ou alors est-ce qu'il y a besoin de ce model ?
            // est-ce que l'engine ne peut pas géré cette un "query"
            app.models.query = new Cello.ui.QueryModel({
                cellist: app.models.cellist,
            });

            // --- Graph model ---
            // Graph View model
            app.models.graph = {} //warn: it is updated when result arive
            app.models.vizmodel = new Cello.gviz.VizModel({});

            // --- Clustering model ---
            // Clustering model and view
            app.models.clustering = new Cello.Clustering({});
        },

        /** 
         *   Create documents list views
         */
        create_results_views: function(){
            var app = this;
            
            /** Create views for clustering */
            // label view
            // Note: the inheritage is not absolutely needed here, except for label overriding.
            // however if one want to add clustom events on each label it should
            // do that, so as documentation/exemple it is usefull the 'extend'.
            var ClusterLabel = Cello.ui.clustering.LabelView.extend({
                template: _.template($('#ClusterLabel').html().trim()),
                
                events: {
                    "click": "clicked",
                },
                
                /* Click sur le label, */
                clicked: function(){
                    app.navigate_to_label(this.model.label);
                },
                
                //RMQ: this computation may also be donne directly in the template
                before_render: function(data){
                    console.log(data.label, data.score)
                    data.size = 9 + data.score / 17.;
                    return data
                },
            });

            // view over a cluster
            var ClusterItem = Cello.ui.clustering.ClusterItem.extend({
                tagName: 'li',
                LabelView: ClusterLabel,
            });

            // Cluster (label lists) view
            // Note: the list of cluster is just a classical ListView
            app.views.clustering = new Cello.ui.list.ListView({
                model: app.models.clustering,
                ItemView: ClusterItem,
                el: $("#clustering_items"),
            }).render();
            //$("#clustering_items").show(); // make it visible

            /** Create view for graph */

             // Graph View itself
            app.views.gviz = new Cello.gviz.ThreeViz({ 
                el: "#vz_threejs_main",
                model: app.models.vizmodel,
                edges_color: 0x79878A,
                background_color: 0xFEFFFE,
                text_scale : 0.12,
                wnode_scale: function(vtx){
                    console.log(vtx)
                    return 15. + vtx.get("gdeg") / 20.;
                },
            });
            // we want to change the color of edges of selected nodes
            app.models.vizmodel.on('change:selected', function(){
                //console.log('vizmodel change:selected', arguments);
                Cello.gviz.ThreeVizHelpers.edges_colors_on_node_selected(app.views.gviz);
            });

              // gviz rendering loop
            app.views.gviz.enable().animate();
        },

        // helper: add app attributes to global scope
        // put cello and the app in global for debugging
        _add_to_global: function(){
            var app = this;
            window.Cello = Cello;
            window.app = app;
        },

        //### actions ###

        /** Navigate (=play engine) to a vertex by giving it exact label
        */
        navigate_to_label: function(label){
            var app = this;
            app.models.query.set('query', label);
            app.models.query.run_search();
        },

        /** When a cluster is selected
         *
         * if one (or more) cluster is selected:
         *  * add a tag 'cluster_active' on all document of selected cluster
         *  * add a tag 'cluster_hidden' on all other documents
         *
         * if no cluster are selected
         *  * remove this two tags from documents
         */
        cluster_selected: function(){
            var app = this;
            // // get selected clusters
            var selected = app.models.clustering.selected;
            
            if(selected.length == 0){
                // remove all flags
                app.models.graph.vs.each( function(vertex){
                    vertex.remove_flag('faded');
                });
            } else {
                // fade/unfade vertices in clusters 
                var vids = {}
                _.each(selected, function(cluster){
                    _.each(cluster.vids, function(vid){
                        vids[vid] = true;
                    })
                });
                app.models.graph.vs.each( function(vertex){
                    if (_.has(vids, vertex.id)){
                        vertex.remove_flag('faded');
                    }
                    else { 
                        vertex.add_flag('faded');
                    }
                });
                app.models.graph.es.each( function(edge){
                    if (_.has(vids, edge.source.id) || _.has(vids, edge.target.id)){
                        edge.remove_flag('faded');
                    } else {
                        edge.add_flag('faded');
                    }
                });
            }
        },

        /** when a query is loading
         *
         * Update the rooter (url) and add waiting indicator
         */
        search_loading: function(kwargs, state){
            var app = this;
            // get the query
            var query = kwargs.query;
            // change the url
            app.router.navigate("q/"+query);
            Cello.utils.piwikTrackCurrentUrl(); // force piwik (if any) to track the new 'page'
            //start waiting
            $("#loading-indicator").show(0);
        },

        /** when a search response arrive (in success)
         */
        engine_play_completed: function(response, args, state){
            var app = this;
            if(app.DEBUG){
                console.log("play:complete", 'args', args, 'state', state); 
                app.response = response;    // juste pour le debug
            }
            //stop waiting
            $("#loading-indicator").hide(0);

            // reset clustering
            app.models.clustering.reset(response.results.clusters);
            // setup the views if needed
            app.open_results_view();

            // parse graph
            app.models.graph = new Cello.Graph(response.results.graph, {parse:true});

            // apply layout 
            var coords = response.results.layout.coords;
            for (var i in coords){
                app.models.graph.vs.get(i).set("coords", coords[i]);
            }

            // put colors on graph nodes
            _.map(app.models.graph.vs.select({}), function(model){
                model.set('default_color', model.get('color'))
                var cid = app.models.clustering.membership[model.id]
                model.set('color', app.models.clustering.cluster(cid[0]).color);
                model.set('color', model.get('prox_color'))
            });

            // reset graph visualization
            app.views.gviz.set_graph(app.models.graph);
        },

        // change the views to search results
        open_results_view: function(force){
            var app = this;
            if(!app.search_results || force){
                app.search_results = true;
                app.create_results_views();
            }
        },

        // change the views to home page
        open_home_view: function(force){
            var app = this;
            if(app.search_results || force){
                app.search_results = false;
            }
        },

        /** when the search failed
         */
        engine_play_error: function(response, xhr){
            var app = this;
            if(app.DEBUG){
                console.log("play:error", 'response', response);
                app.response = response;    // juste pour le debug
                app.xhr = xhr;
            }

            //stop waiting
            $("#loading-indicator").hide(0);
            
            var text;

            if(!_.isEmpty(response)){
                // There is a cello response
                // so we can get the error messages
                text = response.meta.errors.join("<br />");
            } else {
                // HTTP error, just map the anwser
                text = $(xhr.responseText);
                // HACK:
                $("body").css("margin", "0"); //note: the Flask debug has some css on body that fucked the layout
            }

            var alert = Cello.ui.getAlert(text);
            $("#other_side").prepend(alert);
        },


        // main function
        start: function(){
            var app = this;
            app.DEBUG = DEBUG;

            // get the root url from the template
            //// note: this is usefull to have the app instaled in unknow 'suburl'
            app.root_url = $("#page").attr("data-root-url"); 

            // initialise the app it self
            app.create_models();
            
            ///// DEBUG: this add the app to global (guardian_app)
            app._add_to_global();

            app.has_search_results = false // indicate that the search result view is not open
            app.open_home_view(true);

            // --- Binding the app ---
            _.bindAll(this, "engine_play_completed", "cluster_selected", "search_loading");
            // bind clusters
            this.listenTo(app.models.clustering, 'change:selected', app.cluster_selected);

            // bind the engine
            // app events
            this.listenTo(app.models.cellist, 'engine:change', function(e){console.log('engine:change', e);});
            // bind query model, when play start
            this.listenTo(app.models.cellist, 'play:loading', app.search_loading);
            // when the search (play) is completed
            this.listenTo(app.models.cellist, 'play:complete', app.engine_play_completed);
            //when search failed
            this.listenTo(app.models.cellist, 'play:error', app.engine_play_error);

            // Router
            var AppRouter = Backbone.Router.extend({
                routes: {
                    '': 'index',
                    'q/:query': 'search',
                },

                initialize: function() {
                    console.log('<router init>');
                },

                index: function() {
                    console.log('<router> root /');
                    // index page setup
                    app.open_home_view();
                },

                search: function(query){
                    console.log("<router> search start");
                    app.navigate_to_label(query)
                    //note: results view are open on callback
                }
            });

            // create the rooter
            app.router = new AppRouter();
            // Everything is now in place...
            app.models.cellist.fetch({ success: function(){
                // start history
                Backbone.history.start({pushState: true, root: app.root_url});
                //// auto play for debug productivity
                //app.models.query.set('query', 'euro');
                //app.models.query.run_search();
            }});

        },
    });
    return App;
    // What we return here will be used by other modules
});
