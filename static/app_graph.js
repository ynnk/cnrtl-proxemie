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

        // base url, note: overriden by info in template
        root_url: "/",
        
        inited : false,

        // create the models
        create_models: function(){
            var app = this;

            // create the engine
            app.models.cellist = new Cello.Engine({url: app.root_url+"api"});
            //NOTE: the url is from root, issue comming if "api" entry point is not at root

            // --- Query model ---
            app.models.query = new Cello.QueryModel({
                cellist: app.models.cellist,
            });

            // --- Graph model ---
            // Graph View model
            app.models.graph = {} //warn: it is updated when result arive
            app.models.vizmodel = new Cello.gviz.VizModel({graph: app.models.graph});

            // --- Clustering model ---
            // Clustering model and view
            app.models.clustering = new Cello.Clustering({});
            
            // --- List model ---
            app.models.vertices = new Cello.DocList();

        },

        /** 
         *   Create documents list views
         */
        create_results_views: function(){
            
            if ( _.size(this.views)) 
                return;
            
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
                clicked: function(event){
                    /* navigate */
                    event.preventDefault();
                    event.stopPropagation();
                    //app.navigate_to_label(this.model.label);
                    /* select vertex */
                    // 'this.model' is a label not a vertex !
                    var vertices = app.models.graph.select_vertices({label:this.model.label});
                    var vid = vertices[0].id
                    app.models.vizmodel.set_selected(vid);
                },
                
                //RMQ: this computation may also be done directly in the template
                before_render: function(data){
                    //console.log(data.label, data.score)
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

            // when #clustering_items is "show" change graph colors
            $('#clustering_items').on('show.bs.collapse', function () {
                app.models.graph.vs.copy_attr('cl_color', 'color',{silent:true});
                app.views.gviz.update();
            });

            // vertex sorted by proxemy
            var ItemView = Cello.ui.doclist.DocItemView.extend({
                template: _.template($("#ListLabel").html()),
                events:{
                    "click": "clicked",
                    "mouseover": "mouseover",
                    "mouseout": "mouseout",
                    "addflag": "some_flags_changed",
                    "rmflag": "some_flags_changed",
                },
                
                 initialize: function(options){
                    // super call 
                    ItemView.__super__.initialize.apply(this);
                    // override
                    this.listenTo(this.model, "rmflag", this.flags_changed);
                    this.listenTo(this.model, "addflag", this.some_flags_changed);
                },
                
                /* Click sur le label, */
                clicked: function(event){
                     app.models.vizmodel.set_selected(this.model.id);
                },
                
                mouseover: function(){
                    app.models.vizmodel.set_intersected(this.model.id);
                    app.views.gviz.render();
                    //^ XXX to force immediat rendering
                    // this should be binded by default
                },

                mouseout: function(){
                    app.models.vizmodel.set_intersected(null);
                    app.views.gviz.render();
                },
                some_flags_changed: function(){
                    this.flags_changed();
                    this.scroll_to();
                },
                
            });

            app.views.proxemy = new Cello.ui.list.ListView({
                model : app.models.vertices,
                ItemView: ItemView,
                el: $("#proxemy_items"),
            }).render();
            
            // when #proxemy_items is "show" change graph colors
            $('#proxemy_items').on('show.bs.collapse', function () {
                app.models.graph.vs.copy_attr('prox_color', 'color', {silent:true});
                app.views.gviz.update();
            });

            /** Create view for graph */

             // Graph View itself
            app.views.gviz = new Cello.gviz.ThreeViz({ 
                el: "#vz_threejs_main",
                model: app.models.vizmodel,
                edges_color: 0x79878A,
                background_color: 0xFEFEFE,
                text_scale : 0.12,
                wnode_scale: function(vtx){
                    return 10. + vtx.get("gdeg") / 20.;
                },
            });
            // we want to change the color of edges of selected nodes
            app.models.vizmodel.on('change:selected', function(){
                //console.log('vizmodel change:selected', arguments);
                var selected = app.models.vizmodel.get('selected')
                var last_selected = app.models.vizmodel.get('last_selected')
                
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
            console.log("navigate_to_label", label)
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
                app.views.gviz.update();
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
            
            // collapse current graph viz
            if ( _.size(this.views)) {
                app.views.gviz.collapse(200);
            }

            //start waiting
            $("#loading-indicator").show(0);
            
            // force piwik (if any) to track the new 'page'
            Cello.utils.piwikTrackCurrentUrl(); 
            
        },

        /** when a search response arrive (in success)
         */
        engine_play_completed: function(response, args, state){
            var app = this;
            if(app.DEBUG){
                console.log("play:complete", 'args', args, 'state', state); 
                app.response = response;    // juste pour le debug
            }
            
             // setup the views if needed
            app.create_results_views();
            
            //stop waiting
            $("#loading-indicator").hide(0);

            // reset clustering
            app.models.clustering.reset(response.results.clusters);

            // parse graph
            app.models.graph = new Cello.Graph(response.results.graph, {parse:true, silent:true});

            // apply layout 
            var coords = response.results.layout.coords;
            for (var i in coords){
                app.models.graph.vs.get(i).set("coords", coords[i], {silent:true});
            }

            // set cluster colors 
            _.map(app.models.graph.vs.select({}), function(model, i, list ){
                model.set('default_color', model.get('color'))
                var cid = app.models.clustering.membership[model.id]
                model.set('cl_color', app.models.clustering.cluster(cid[0]).color, {silent:true});
            });
            
            // FIXME :
            // default color does not depend on visible panel
            app.models.graph.vs.copy_attr('cl_color', 'color',{silent:true});
            
            // reset proxemy view
            app.models.vertices.reset(app.models.graph.vs.models)
            // reset graph visualization
            app.views.gviz.set_graph(app.models.graph);
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
                    app.navigate_to_label("_all")
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
            }});

        },
    });
    return App;
    // What we return here will be used by other modules
});
