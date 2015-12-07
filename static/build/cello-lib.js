
(function(root, factory) {
    // reuire.js
    if (typeof define === 'function' && define.amd) {
        // require.js impl 
        define(['underscore','backbone'],
            function(_,Backbone) {
              return factory(root,  _,Backbone);
        });
    } 
    //FIXME: implements nodejs loading
    //wide scope
    else {
        root.Cello = factory(root, _,Backbone);
    }
}(this, function(root, _,Backbone) {

//==src/core/core.js==

    /**
     * The Cello object
     */
    var Cello = { 
        desc: "",
        version: 0.103,
        license: "!! TODO !!", 
        DEBUG: false,
    };

    Cello.log = function(){
        console.log("INFO", arguments);
    };
    
    Cello.debug = function(){
        if (Cello.DEBUG){
            console.log("DEBUG", arguments);
        }
    };

    Cello.assert = function(condition, message) {
        if (!condition) {
            throw new Error(message || "Assertion failed");
        }
    };

    /** Helper to add a 'property' getter on models
     */
    Cello.get = function(model, prop_name, getter){
        var default_getter = function(){
            return this.get(prop_name);
        };
        getter = getter || default_getter ;
        model.__defineGetter__(prop_name, getter);
    };

    /** Helper to add a 'property' setter on models
     */
    Cello.set = function(model, prop_name, setter){
        var default_setter = function(val){
            return this.set(prop_name, val);
        };
        setter = setter || default_setter ;
        model.__defineSetter__(prop_name, setter);
    };
    
    Cello.getset = function(model, prop_name, getter, setter){
        Cello.get(model, prop_name, getter);
        Cello.set(model, prop_name, setter);
    };


    Cello.FlagableCollection = function(model, collection){
        /** returns the document having a given flag
         */
        model.by_flag = function(flag){
            return collection.filter(function(doc){
                return doc.has_flag(flag);
            });
        };

        /** Add a flag to the all documents
         */
        model.add_flag = function(flag){
            _.each(collection.models, function(doc){
                doc.add_flag(flag);
            });
        };

        /** Remove a flag to all documents
         */
        model.remove_flag = function(flag){
            _.each(collection.models, function(doc){
                doc.remove_flag(flag);
            });
        };    
    };

    Cello.Flagable = function(model) {
        model.defaults.flags = [];
        Cello.get(model, "flags");

        /** Add a flag to the document
         * !! removes silently
         */
        model.add_flag = function(flag){
            if(!this.has_flag(flag)){
                this.set("flags", _.union(this.flags, [flag]), {silent:true});
                this.trigger("addflag", flag, this);
                this.trigger("addflag:"+flag, this);
            }
        };

        /** Remove a flag to the document
         * !! removes silently
         */
        model.remove_flag = function(flag){
            if(this.has_flag(flag)){
                this.set("flags", _.without(this.flags, flag), {silent:true});
                this.trigger("rmflag", flag, this);
                this.trigger("rmflag:"+flag, this);
            }
        };

        /** Return true if the document has the given flag
         */
        model.has_flag = function(flag){
            if (!this.flags)
                console.log(this);
            
            return this.flags.indexOf(flag) >= 0;
        };
    };

    /**
     * An model sortable should have the following attributes
     *  - sort_reverse: bool, wheter reverse order or not
     *  - sort_key: str, the sort key to use
     *  - sortables: list of tupple, XXX need more doc
     */
    Cello.Sortable = function(model) {
        /**
         * param obj: model
         * param params: set of sortable ( name, (type, field or function ) )
         * TODO function not implemented
        **/
        model.sorted = function(elements) {
            /*
            * elements: alist of models
            * reverse: wheter to reverse sort
            */
            var reverse =  model.get('sort_reverse');
            var key = model.get('sort_key');
            if (key in model.get('sortables')) {
                var sortable = model.get('sortables')[key];
                var sort_type = sortable[0];
                var sort_field = sortable[1];
                var comparator = Cello.Sortable.SortComparator;
                Cello.debug('sort by ' + key, sortable);
                elements.sort(comparator(sort_type, sort_field)); // type, field
            }
            if (reverse) {
                elements.reverse();
            }
            return elements;
        };
        return model;
    };

    /* Set of comparator */
    Cello.Sortable.StrComparator = function(field) {
        return function(a, b) {
            return a.get(field) == b.get(field) ? 0 : a.get(field) > b.get(field) ? 1 : -1;
        }
    };
    Cello.Sortable.NumericComparator = function(field) {
        return function(a, b) {
            return (a.get(field) - b.get(field)) == 0 ? 0 : (a.get(field) - b.get(field)) > 0 ? 1 : -1;
        }
    };
    
    /* Returns a comparator according to cmp type, and to the field to compare
    */
    Cello.Sortable.SortComparator = function(type, field) {
        if ( _.isFunction(type) ) return type(field);
        else if (type === 'alpha') return Cello.Sortable.StrComparator(field);
        else if (type === 'numeric') return Cello.Sortable.NumericComparator(field);
        else throw Error("comparator not found ! (type: '"+type+"')");
    };
    

//==src/core/docs.js==


/** Model of list of documents
 *
 * contain a collection of documents(Collections.Docs)
 * 
 */
Cello.DocList = Backbone.Model.extend({
    defaults: {
        // sort attributes
        sort_key: 'title',
        sort_reverse: false,
        sortables: {},
        // documents
        collection: null, // this is build in initialize
        // note: ^ this attribut should be named 'documents'
    },

    DocumentModel: Cello.Doc,  // the default model used for documents, may be override in initialize

    initialize: function(attrs, options) {
        attrs = attrs  || {};
        // getter
        Cello.get(this, 'collection');
        Cello.get(this, 'elements', this._get_elements); // sorted and filtered elements
        Cello.get(this, 'selected', this._get_selected);
        Cello.get(this, 'length', function() { return this.collection.length });
        // add sort functionalities
        Cello.Sortable(this); // iter with elements() !!
        //Filterable(this);
        
        // init DocumentModel
        this.DocumentModel = attrs.DocumentModel || this.DocumentModel
        // create (empty) collection of documents
        var collection = attrs.collection || new Backbone.Collection([], {
            model: this.DocumentModel,
            idAttribute: 'docnum',
        });
        collection.doclist = this;
        this.set("collection", collection);
        // FlagableCollection
        Cello.FlagableCollection(this, this.collection);
    },

    /** Reset the neested document collection
     *
     * This is the method that should be used to set document list
     */
    reset: function(data) {
        this.collection.reset(data);
        this.trigger("reset");
    },

    /** Get a document according to it's docnum
     */
    get_doc: function(docnum) {
        //TODO: manage docnum doesn't exist
        //TODO: create an index of documents to avoid search
        return this.collection.where({'docnum': docnum})[0]
    },

    /** Returns ellements of the collection (sorted and filtered)
     * note: better to use `this.elements`
     */
    _get_elements: function() {
        var elements = this.collection.models;
        if(this.filters){
            elements = this.apply_filters(elements);
        }
        if(this.get('sortables')) {
            elements = this.sorted(elements);
        }
        return elements;
    },

   

    // Note: selection mechanism is very similar to the one in blocks with components

    /** Get seleced blocks
     * note: better use the getter `this.selected`
     */
    _get_selected: function(){
        return this.collection.where({'selected': true});
    },

    /** Select a document
     */
    select: function(document){
        //TODO what if the document is not in the doclist ?
        if(document.selected) return;
        // select the doc
        document.set('selected', true);
        // triger an event to notify the selection change at doclist level
        this.trigger("change:selected");
    },

    /** unselect all selected documents
     */
    clear_selection: function(){
        var selected = this.selected;
        if(selected.length <= 0) return;
        // unselect all selected
        _.each(selected, function(doc){
            doc.set('selected', false);
        });
        // triger an event to notify the selection change at doclist level
        this.trigger("change:selected");
    },

    /** Unselect a document, or all documents
     */
    unselect: function(document){
        //TODO what if the document is not in the doclist ?
        if(!document.selected) return;
        document.set('selected', false);
        // triger an event to notify the selection change at block level
        this.trigger("change:selected");
    },
});

//==src/core/schema.js==

/**
 *  Cello document, thuis should be extendend in each application
 */
Cello.Doc = Backbone.Model.extend({
    defaults: {
        // core data
        docnum: null,           // this should be provide in init
        // note: other attributes are free (or may be defined by extend)
        // there is not yet schema declaration as in python side

        // 'surfasic' properties
        flags: [],              // free list of "flags"
        selected: false,        // whether the document is selected or not
    },

    /** options that may be given
     */
    initialize: function(attrs, options){
        // getter
        Cello.get(this, "docnum");
        Cello.get(this, "selected");
        // add  flags
        Cello.Flagable(this)
        // check
        Cello.assert(this.docnum !== null, "Document should have a docnum");
    },

    /** Select the curent document (got throw the collection)
     */
    select: function(){
        this.collection.doclist.select(this);
    },

    /** Select the curent or just clear selection if curent is already selected
     */
    toggle_select: function(){
        if(this.selected){
            this.collection.doclist.unselect(this);
        } else {
            this.collection.doclist.select(this);
        }
    },
});

//==src/core/engine.js==

    /*
     * Models 
     * 
     * Engine has Blocks
     * Blocks have Components
     * Components have Options
        */

    /**
     * Option: 
     *  json_option = {
     *         "name": "proj_wgt",
     *         "otype": {
     *           "choices": [
     *             "no", "count", "p", "pmin", "pmax","pavg"
     *           ],
     *           "default": "p",
     *           "help": "Projection weighting method",
     *           "multi": false,
     *           "type": "Text",
     *           "uniq": false,
     *           "vtype": "unicode"
    *         },
     *         "type": "value",
     *         "value": "p"
     *       }
     */
    Cello.Option = Backbone.Model.extend({
        defaults: {
            value: undefined,        // the option value
            name: null,              // the option name
            otype: {}                // declaration of the type of the opt value
        },

        //TODO: piste pour gérer les validations :
        // https://github.com/thedersen/backbone.validation
        //  -> ca peut etre utile pour les 'value'
        //  -> MAIS AUSSI simplement pour bien décrire les property attendu dans chaque obj

        initialize: function(attrs, options){
            // add getter
            Cello.get(this, 'name');
            Cello.get(this, 'otype');
            Cello.get(this, 'value');
            Cello.set(this, 'value', this.validate);
            // check data
            Cello.assert(this.name !== null, "Option should have a name");
            Cello.assert(attrs.otype !== null, "(Option: "+this.name+") otype should not be 'null'");
            
            // TODO set validators
            
        },
        
        validate: function(val){
            // TODO; run validators !
            // parsing...
            if(this.otype.type === "Boolean"){
                console.log(this.otype.type, val);
                val = [true, "true", "True", "TRUE", "1", "yes"].indexOf(val) >= 0;
                console.log(this.otype.type, val);
            }
            
            // check enum
            var choices = this.otype.choices;
            if(choices && _.indexOf(choices, val) < 0){
                throw new Error('invalid option value');
            }

            // set the value
            this.set('value', val);
        },
    });

    /**
     * Collection of Cello.Option
     */
    Cello.Options = Backbone.Collection.extend({
        model : Cello.Option,
    });


    /*
     * Cello Component i.e. minimal processing unit
     */
    Cello.Component = Backbone.Model.extend({
        idAttribute: 'name',
        defaults: {
            name: null,   // the option name
            selected: false, // wheter the component is selected
            doc: "",     // component help doc //TODO rename it "help", doc ca porte a confusion avec document
            options: new Cello.Options()    // Collection of options
        },
        
        initialize: function(){
            // getter/setter
            Cello.get(this, "name");
            Cello.get(this, "options");
            Cello.get(this, "selected");
            
            // listen for change in options collection.
            this.listenTo(this.options, 'reset', this.optionsChanged);
            this.listenTo(this.options, 'change', this.optionsChanged);
            // check data
            Cello.assert(this.name !== null, "Component should have a name");
        },

        get_option: function(name){
            return _.find(this.options.models, function(opt){
                return opt.name == name;
            });
        },

        set_option: function(name, new_value){
            var opt = this.get_option(name);
            opt.value = new_value;
        },

        parse: function(data, options){ 
            data.options = new Cello.Options(data.options, {parse:true});
            // if default == true then select itself
            if(data.default){
                data.selected = true;
            }
            return data;
        },

        optionsChanged: function(model) {
            // trigger new event.
            this.trigger('change', this, model);
            this.trigger('change:options', this, model);
        },

        /** Returns a dictionnary representation of the component
         */
        as_dict: function(){
            var options = {};
            _.each(this.options.models, function(opt){
                options[opt.name] = opt.value;
            });
            return {
                name: this.name,
                options: options
            };
        },
    });


    /**
     * Collection of Cello.Component
     */
    Cello.Components = Backbone.Collection.extend({
        model: Cello.Component,
    });

    /**
     * A processing "block" i.e. a list of possible Component
     */
    Cello.Block = Backbone.Model.extend({
        defaults : {
            name: "",           // name of the component
            components: new Cello.Components(),  // collection of components
            required: true,
            multiple: false,
            args: null,         // input names
            returns: null,      // ouput name
        },

        initialize: function(attrs){
            // add getter
            var _this = this;
            Cello.get(this, 'components');
            Cello.get(this, 'selected', this._get_selected);
            Cello.get(this, 'name');
            Cello.get(this, 'required');
            Cello.get(this, 'multiple');
            Cello.get(this, 'args');
            Cello.get(this, 'returns');

            // check needed values
            Cello.assert(this.name !== null, "Block should have a name");
            Cello.assert((_.isNull(this.args) || _.isArray(this.args)), "'args' should be null or an Array");
            if(this.returns === null){
                this.set("returns", this.name)
            }
            // binds components changes
            this.listenTo(this.components, 'reset', this.componentsChanged);
            this.listenTo(this.components, 'change', this.componentsChanged);
            //Note: for the selection the binding is not automatic
            // as the selection change must pass throw Block
            // an event it direcly trigger from the Block
        },

        componentsChanged: function(model) {
            // trigger new event
            this.trigger('change', this, model);
            this.trigger('change:components', this, model);
        },

        parse: function(data, options){
            // set components
            data.components = new Cello.Components(data.components, {parse:true});
            return data;
        },

        /* clear components */
        reset: function(){
            this.components.reset();
        },

        /** Get a component from it name
         */
        get_component: function(name){
            return _.find(this.components.models, function(comp){
                return comp.name == name;
            });
        },

        /** get seleced blocks
         * not better use the getter block.selected
         */
        _get_selected: function(){
            return this.components.where({'selected': true});
        },

        /** Select a component or unselect it if already selected
         * (and block allow to have no selected component)
         */
        select: function(optionable){
            //TODO what if the component is not in the block ?
            if(optionable.selected) {
                if(!this.required){
                    optionable.set('selected', false);
                    // triger an event to notify the selection change at block level
                    this.trigger("change");
                    this.trigger("change:selected");
                }
            } else {
                if(!this.multiple){
                    _.each(this.selected, function(component){
                        component.set('selected', false);
                    });
                }
                optionable.set('selected', true);
                // triger an event to notify the selection change at block level
                this.trigger("change");
                this.trigger("change:selected");
            }
        },

        /** unselect a component
         */
        unselect: function(optionable){
            //TODO what if the component is not in the block ?
            if(!optionable.selected) return ;
            // unselect if possible...ie not require OR more than one selected
            if( !this.required || (this.multiple && this.selected.length > 1)) {
                optionable.set('selected', false);
                // triger an event to notify the selection change at block level
                this.trigger("change");
                this.trigger("change:selected");
            } else {
                //throw new Error("unselect possible only when multiple is true or not required ");
            }
        },

        /** If component is not required permit to un-select
         */
        clear_selection: function(){
            var _this = this;
            _.each(this.selected, function(component){
                _this.unselect(component);
            });
        },

        /* check component is setup */
        validate: function(){}, //TODO
        
        /** Returns the state of the block current
         */
        get_state: function(){
            var comps = [],
                selections = this.selected;
            for (var j in selections){
                var component = selections[j];
                comps.push( component.as_dict() );
            }
            return comps
        },
    });


    /**
     * Collection of Cello.Block
     */
    Cello.Blocks = Backbone.Collection.extend({
        model: Cello.Block
    });


    /** Cello Engine
     * 
     * ie. the Cello API client
     * basicly a list of Block
     */
    Cello.Engine = Backbone.Model.extend({
        defaults: {
            blocks: new Cello.Blocks(),  // collection de blocks
            args: null,                  // all posisble inputs
            returns: null,               // all possible outputs
            needed_inputs: []            // list of needed_inputs
        },

        // init an engine
        initialize: function(attrs, options){
            // default url value
            var url = attrs.url;

            this.url = [url, "options"].join("/");
            this.play_url = [url, "play"].join("/");

            Cello.get(this, 'blocks');
            Cello.get(this, 'args');
            Cello.get(this, 'returns');
            Cello.get(this, 'needed_inputs');

            this.listenTo(this.blocks, 'change reset', this.blockChanged);
        },

        /** Returns a block from it name
         */
        get_block: function(name){
            return _.find(this.blocks.models, function(block){
                return block.get('name') == name;
            });
        },

        /** Called when a block changed
         */
        blockChanged: function(model) {
            this._update_needed_inputs();
            // trigger new event.
            this.trigger('change', this, model);
            this.trigger('change:blocks', this, model);
        },

        /** update the list of all needed input according to the current engine
            configuration.
         */
        _update_needed_inputs: function(){
            var needed = [];
            var available = [];
            var blocks = this.blocks.models;
            for(var i in blocks){
                var block = blocks[i];
                if(block.selected.length > 0){
                    // check all inpouts
                    for(var j in block.args){
                        var arg = block.args[j];
                        if(available.indexOf(arg) < 0 && needed.indexOf(arg)){
                            // if not available then needed !
                            needed.push(arg);
                        }
                    }
                    // add available
                    available.push(block.returns);
                }
            }
            this.set({"needed_inputs":needed}, {silent:true});
        },

        // create engine model (and neested models) from a cello API json
        parse: function(data, options){
            // create the blocks
            this.data = _.extend({}, data);
            console.log('Engine parse', data, options)
            this.blocks.reset(data.blocks, {parse:true});
            delete data.blocks;
            return data;
        },

        /** Reset the engine with data (same formet as from fetch)
         */
        reset: function(data){
            data = this.parse(data);
            console.log(data)
            this.set(data);
        },

        /* Returns a keb repr ready for json serialization */
        get_state: function(){
            var response = {};
            var blocks = this.blocks.models;
            for (var i in blocks){
                var block = blocks[i];
                response[block.name] = block.get_state();
            }
            return response;
        },

        /** Request the server with current engine configuration and given inputs
         */
        play: function(kwargs){
            var _this = this;
            var state = this.get_state();
            //TODO check needed inputs
            var data  = _.extend({}, kwargs, {'options': state});
            Cello.debug("play", kwargs);
            _this.trigger("play:loading", kwargs, state);
            
            Backbone.ajax({
                url: _this.play_url,
                method: 'post',
                contentType: "application/json",
                data: JSON.stringify(data),
                success: function(response, status, xhr){
                    // get a 200 (or 2**) anwser
                    if(response.meta && response.meta.errors && response.meta.errors.length > 0){
                        // contains a 'cello' error
                        _this.trigger("play:error", response, xhr);
                    } else {
                        _this.trigger("play:complete", response, kwargs, state);
                    }
                },
                error: function(xhr, textStatus, errorThrown){
                    // get an HTTP error anwser (get a 5**)
                    _this.trigger("play:error", {}, xhr);
                },
            });
        },

    });
    

//==src/core/graph.js==

/** 
 * Classes:
 *  Cello.Graph
 *  Cello.Vertex
 *  Cello.Vertices
 *  Cello.Edge
 *  Cello.Edges 
 * 
 * TODO:
 *  Node js compatibility
 */


Cello.Graph = Backbone.Model.extend({
    // const
    IN : 1,
    OUT : 2,
    ALL : 4,
    // defaults model attributes
    defaults : {
        // graph properties
        directed: false,
        bipartite: false,
    },

    initialize: function(attrs, options){
        // init
    },

    parse: function(json, options){
        // create a graph from json data
        Cello.debug("parse graph", json);
        this.vs = new Cello.Vertices([],{graph:this}); // <Vertex> collection
        this.es = new Cello.Edges(); // <Edge> collection
        this.edge_list = {}; // TODO {nid: [edges], ...}
        //TODO edge_list_in/edge_list_out
        
        var nodes = json.vs;
        for ( var n in nodes){
            var vertex = new Cello.Vertex(_.extend(nodes[n], {graph:this}));
            this.add_vertex(vertex);
        }
        var edges = json.es;
        for ( var e in edges){
            var edge = new Cello.Edge( _.extend(edges[e],{graph:this}));
            this.add_edge(edge);
        }
        
        Cello.FlagableCollection(this, this.vs);
        Cello.FlagableCollection(this, this.es);
        return json.attributes;
    },

    summary: function(){
        /* Returns the summary of the graph **/
        // <{'attr':value, ...}> graph.summary()
        return {
            attrs: this.attributes,
            vcount: this.vcount(),
            ecount: this.ecount(),
            density: this.density(),
            v_attrs: this.attributes.v_attrs,
            e_attrs: this.attributes.e_attrs
        };
    },
    
    str: function(){
        // <str> graph.toString()
        /** Returns the graph summary as a string */
        var template = _.template("v:<%=vcount%>, e:<%=ecount%>," +
            "density:<%=density%>,\n" +
            "v attrs:<%=v_attrs%>, \n" +
            "e attrs:<%=e_attrs%>, "
        );

        return template( this.summary() );
    },

    // === Vertex ===
    // graph nodes and edges manipulation

    add_vertex : function(vertex){
        /** Add a Cello.Vertex vertex  
         * <void> graph.add_vertex(vertex)
         */
        if (vertex.id === undefined)
            vertex.id = this.vs.size();
            
        if (vertex && this.vs.get(vertex.id) === undefined ){
            this.vs.push(vertex);
            if ( ! (vertex.id in this.edge_list) )
                this.edge_list[vertex.id] = [];
        }
    },


    // TODO
    delete_vertices: function(vs){
        /** Deletes vertices and all its edges from the graph.
         *  @param vs: a single vertex ID or the list of vertex IDs
         *      to be deleted.
         */
        // <void> graph.delete_vertices([vertices_ids])
    },

    // <int> graph.vcount()
    vcount : function(){
        /* count of vertices in the graph */
        return this.vs.length;
    }, //<int>



    // === Edges ===

    add_edge : function( edge ){
        this.es.push(edge);
        this.edge_list[edge.source.id].push(edge);
        this.edge_list[edge.target.id].push(edge);
    },  // XXX TODO XXX

    /**
     * Delete edges (from igraph)
     * @param es : The set of edges to be deleted
     * The first positional argument is considered as follows:
     *    - C{Null} - deletes all edges
     *    - a single integer - deletes the edge with the given ID
     *    - a list of integers - deletes the edges denoted by the given IDs
     *    - a list of 2-tuples - deletes the edges denoted by the given
     *         source-target vertex pairs. When multiple edges are present
     *         between a given source-target vertex pair, only one is removed.
    **/
    delete_edges: function(es){
        var self = this;
        var f_rm = function(e){ return self.es.get(e); };
        if (es === null ) return ;
        else if (_.isNumber(es) ){ // single integer
            this.es.remove(this.es.get(es));
        }
        else if (_.isArray(es) ){
            if (_.isNumber(es[0]) ){ // list of integers
                this.es.remove( _.map( es, f_rm ));
            }
            else if (_.isArray(es[0]) && es[0].length == 2  ){ // list of pairs
                // TODO
                throw Exception('Models.Graph delete_edges is  unimplemented');
            }
        }
    },

    /**
     * Checks whether a specific set of edges contain loop edges
     * @param edges: edge indices which we want to check. If C{None}, all
     *  edges are checked.
     * @return: a list of booleans, one for every edge given
     **/
    is_loop: function(edges){
        //TODO comportement a la igraph si edges undifined => sur tout g.es
       var isloop = function(edge){
           return edge.source === edge.target;
           //TODO return edge.is_loop()
       };
       return _.map(edges, isloop);
    },

    /** Return count of edges in the graph */
    ecount: function(){
        return this.es.length;
    }, //<int>

    /** Returns list of incident edges
     * @param vertex: vertex to consider
     * @param mode: IN OUT or ALL
     * @param loops: whether self-loops should be returned.
     * */
    incident: function(vertex, mode, loops){
        var graph = this,
            edges = [],
            vid = vertex.id,
            _mode = mode === undefined ? this.ALL: mode,
            _loops = loops === undefined || loops;
        
        
        if (_mode == graph.ALL ){
            edges = _.filter(graph.edge_list[vid], function(edge){
                    return ( !_loops ? !edge.is_loop() : true );
                });
        }
        else if (_mode == graph.IN ){
            edges = _.filter(graph.edge_list[vid], function(edge){
                    return edge.source.id == vid && ( !_loops ? !edge.is_loop() : true );
                });
        }
        else if (_mode == graph.OUT ){
            edges = _.filter(graph.edge_list[vid],function(edge){
                    return edge.target.id == vid && ( !_loops ? !edge.is_loop() : true );
                });
        }
        return edges;

    },

    degree: function(vertex, mode, loops ){
        /** Returns some vertex degrees from the graph.
         * This method accepts a single vertex ID or a list of vertex IDs as a
         * parameter, and returns the degree of the given vertices (in the
         * form of a single integer or a list, depending on the input
         * parameter).
         * <int> or [<int>] degree(vertices, mode=ALL, loops=True)

         * @param vertices: a single vertex ID or a list of vertex IDs
         * @param mode: the type of degree to be returned (L{OUT} for
         *  out-degrees, L{IN} IN for in-degrees or L{ALL} for the sum of
         *  them).
         * @param loops: whether self-loops should be counted.
         * @return <int> or [<int>] degrees
        **/
        return this.incident(vertex, mode, loops).length;
    }, //

    strength: function(vertex, mode, loops){
        /**
         * Returns the strength (weighted degree) of some vertex from the graph
         *
         * This method accepts a single vertex ID or a list of vertex IDs as a
         * parameter, and returns the strength (that is, the sum of the weights
         * of all incident edges) of the given vertices (in the
         * form of a single integer or a list, depending on the input
         * parameter).
         * <int> strength(vertices, mode=ALL, loops=True)
         *
         * @param vertex: a single vertex 
         * @param mode: the type of degree to be returned (L{OUT} for
         *   out-degrees, L{IN} IN for in-degrees or L{ALL} for the sum of
         *   them).
         * @param loops: whether self-loops should be counted.
        **/
        var incident = this.incident(vertex, mode, loops);
        var _strength = function  (memo, edge){ // reduce sum
            return memo + edge.weight;
        };
        return _.reduce(incident, _strength, 0);
    },


    /**
     * deprecated : use select(props)
     */ 
    select_vertices: function(props) {
        return this.select(props)
    },
    
    select: function(props) {
        /**
        taken from igraph.vs.select props part only
        params: props dict of pairs (keyword, value)
                keyword is 'attr_kw'
                * attr{_.keys(doc)} doc attrs
                * kw{ne}: not equal to
                * kw{eq}: equal to
                * kw{lt}: less than
                * kw{gt}: greater than
                * kw{le}: less than or equal to
                * kw{ge}: greater than or equal to
                * kw{in}: checks if the value of an attribute is in a given list
                * kw{notin}: checks if the value of an attribute is not in a given list
        return:  function filter for theses props
        >>> filter = create_filter({'score:lt' : 1, 'label':"boo"})
        >>> // same has
        >>> filter = filter({'score:lt' : 1, 'label:eq':"boo"})
        * select using vertex method
        >>>
        */
        // vertex allowed method
        var methods = {"degree":1, "strength":1 };
        
        var filter = function(obj){
            for (var k in props) {
                var value = props[k];
                var kf = k.split(':');
                var kname = kf[0];
                var keyword = kf.length == 2 ? kf[1] : 'eq';
                var obj_value;
                
                if (kname.substring(0,1) == '_' ){ // vertex method 
                    method = kname.slice(1);
                    if (method in methods) {
                        obj_value = obj[method]();
                    }
                }
                else  // vertex attr
                    obj_value = obj.get(kname);
                
                if (keyword == 'eq') { 
                    if (_.isEqual(obj_value, value) === false) return false; }
                else if (keyword == 'ne') { 
                    if (obj_value == value) return false;}
                else if (keyword == 'lt') { 
                    if ((obj_value < value) === false) return false; }
                else if (keyword == 'gt') { 
                    if ((obj_value > value) === false) return false; }
                else if (keyword == 'le') { 
                    if ((obj_value <= value) === false) return false; }
                else if (keyword == 'ge') { 
                    if ((obj_value >= value) === false) return false; }
                else if (keyword == 'in') { 
                    if (_.indexOf(value, obj_value) === -1) return false; }
                else if (keyword == 'notin') { 
                    if (_.indexOf(value, obj_value) !== -1) return false; }
//            else if (keyword == "inter"){ 
//                  if (_.indexOf(value, obj_value) != -1) return false; }
            }
            return true; // congrat, you passed the test
        };
        return _.filter(this.vs.models, filter);
    }, // apply filter

    /* Return a random vertex from the graph
     *  -first take a random edge from graph.es
     *  -then head/tail the source or target vertex from the edge 
     */
    random_vertex: function(){
        var random_edge = this.es.at(random_int(0, this.es.size()-1));
        //console.log("random",random_edge)
        return Math.random() > 0.5 ? random_edge.source : random_edge.target; 
    },

    // Graph theory

    /* <float> density() */
    density: function() {
        /** Returns the number of edges vs. the maximum number of possible edges.
         * For example, <0.35 => sparse, >0.65 => dense, 1.0 => complete.
         */
        return 2.0*this.es.length / (this.vs.length * (this.vs.length-1));
    },

    /**
     * FIXME  not working
     *
     * will be used with dijkstra algo to find shortest path
     * TODO directed undirected
     */
    adjacency : function(){
        var adj_matrix = [],
            _i_ = Infinity,
            len = 0;
        // create empty matrix
        var zeros = function(){return 0;};
        for (len=this.vcount(), i = 0; i<len; i++){
           adj_matrix.push(_.range(len).map(zeros));
        }
        // fill with edges
        for ( len=this.ecount(), i=0; i<len; i++  ){
            var edge = this.es[i];
            adj_matrix[edge.source][edge.target] = edge.weight;
        }
        this.adjacency =  adj_matrix;
    }
    
});

Cello.Vertex = Backbone.Model.extend({
    /**
     * Class representing a single vertex in a graph.
     * get attributes by calling 'get' method
     * >>> v.get('color')
     */
    idAttribute: "id",

    defaults: {
        // vertex attrs
        _id: undefined,
        label: "",
        color: "",
        coords:[0,0,0],
        graph: null,
        flags:[],
    },

    // init
    initialize: function(attrs, options){
        this.graph = attrs.graph;
        Cello.get(this, "_id");
        _.bindAll(this, 'degree','label', 'neighbors', 'strength');
        Cello.Flagable(this);
    },
    
    getHexColor : function(){
        /* returns int color value  */
        return 0;//this.get('color') ;
    },
    
    add_class: function(){
        this.set()
    },

    /* <str> vertex.label() */
    label: function (){
        return  this.get('label');
    },

    /* <int> vertex.degree(mode=ALL, loop=true) */
    degree: function(mode, loop){
        /** Proxy method
         *  @see  Graph.degree(vertices, mode, loops)
         */
        return this.graph.degree(this, mode, loop );
    },
    /* <float> vertex.strength(mode=ALL, loop=true) */
    strength: function(mode, loop){
        /** Proxy method
         *  @see  Graph.strength(vertices, mode, loops)
         */
         
         return this.graph.strength(this, mode, loop);
    },
    /* [<Vertex>] neighbors.strength(mode=ALL, loop=true) */
    neighbors : function(mode, loop){
        /** Proxy method
         *  see  Graph.neigbors(mode=ALL, loop=true)
         */
        return this.graph.incident(this, mode, loop);
    },

});


/**
 * Class representing a single edge in a graph.
 */
Cello.Edge = Backbone.Model.extend({

    defaults : {
            flags : [],
        },

    initialize: function(attrs, options){
        this.graph = attrs.graph;
        this.source = this.graph.vs.get(attrs.s);
        this.target = this.graph.vs.get(attrs.t);
        this.weight =  attrs.w;
        Cello.Flagable(this);
    },

    str: function(){
        var func = function(v, k){ return k+ ": "+ v; };
        return   "("+this.get('s') + "," + this.get('t')+")  " +
            this.source.label() + "-->" +  this.target.label()+','  +
            _.map(this.attributes, func).join(', ');
    },

    tuple: function(){},

    is_loop: function(){
        return this.source.id == this.target.id;
    },
});


Cello.Vertices = Backbone.Collection.extend({
    model: Cello.Vertex,
    
    initialize: function(models, options){
        this.graph = options.graph;
    },
    
    copy_attr: function(src, dest, options){
        /*
         * copy src attr into dest attr
         * param src: src attr name
         * param dest: target attr name
         *      todo dest could be a function 
         **/
        _.map(this.graph.vs.select({}), function(model){
            model.set(dest, model.get(src), options);
        });
    },
    
    select: function(props){
        return this.graph.select_vertices(props);
    },
});

Cello.Edges = Backbone.Collection.extend({
    model: Cello.Edge,
});



// Returns a random integer between min and max
// Using Math.round() will give you a non-uniform distribution!
function random_int(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

//==src/core/clustering.js==

/**
 * Clustering models
 * 
 * Note: the design of Cello.Clustering is similar to Cello.DocList model
 */
 


    /**
     * A label describing a cluster
     */
    Cello.ClusterLabel = Backbone.Model.extend({
        /**
         *  label can be overriden at initialize 
         */ 
        defaults: { 
            label: null,    // the text of the label
            score: 1,
            role: "*",      // the "role" (ie kind of type) of the label
            size: 12 ,
        },
        
        initialize: function(){
            Cello.get(this, "label");
            Cello.get(this, "role");
            Cello.get(this, "score");
        },
    });

    /** Cluster
     *  docnums: maps the docnums in doclist
     *  vids: map vertex idx in graph
     *  labels: list of labels
     **/ 
    Cello.Cluster = Backbone.Model.extend({
        defaults: { 
            // core attributes
            docnums: [],            // list of docnums inside the cluster
            vids: [],               // list of the vertex id inside the cluster
            labels: null,           // collection of Cello.ClusterLabel
            color: [200,200,200],
            misc: false,
            // more surfacic attributes
            selected: false,    // is the cluster selected ?
            roles: [],          // list of select roles for labels display
         },

        initialize: function(attrs, options){
            // Getters
            Cello.get(this, 'docnums');
            Cello.get(this, 'vids');
            Cello.get(this, 'labels');
            Cello.get(this, 'misc');
            Cello.getset(this, 'color'); //TODO; add validate on setter
            Cello.get(this, 'selected');    // true if selected
            Cello.get(this, 'roles');       // list of active roles (for labels)
            Cello.set(this, 'roles', this._set_roles)

            // make 'labels' to be a collection     //XXX: strange ? is it a parsing ?
            var labels = this.get('labels') || []
            labels = new Backbone.Collection(labels, {
                model: Cello.ClusterLabel //TODO: another ClusterLabel model could be passed as argument
            });
            this.set('labels', labels, {silent:true});
        },

        /**
         * check wether cluster is misc aka agglomeration of small clusters or
         * unclustered items
         *
         * DEPRECATED: use `this.misc`
         */
        is_misc: function(){ 
            return this.misc;
        },

        /** Returns the list of all label's roles
         *
         * hidden: default=False, it True even hidden roles are listed (thoses that starts with _)
         */
        all_roles: function(hidden){
            var roles = _.map(this.labels.models, function(model){
                return model.get('role');
            });
            roles = _.union(roles);
            if(!(_.isEmpty(roles)) && !hidden){
                roles = _.filter(roles, function(role){ return role !== null && role.substring(0,1) != "_";} );
            }
            return roles;
        },
        
        /** Select the active label roles
         *
         * This should be call with the property:
         * cluster.role = 'keywords';
         */
        _set_roles: function(roles){
            if(!(roles instanceof Array)){
                roles = [roles];
            }
            this.set('roles', roles);
        },
        
        /** Get labels the labels for the selected roles, or for some roles
         * roles: if undefined use 'roles' attribute, else one role or a list of role
         *
         * a empty role list mean all roles
         */
        get_labels: function(roles){
            var selected;
            if(roles === undefined){
                roles = this.roles;
            } else {
                if(!(roles instanceof Array)){
                    roles = [roles];
                }
            }
            // get the labels
            selected = _.filter(this.labels.models, function(label){return _.indexOf(roles, label.role) >= 0});
            return selected;
        },

        /** Select the curent cluster (got throw the collection)
         *
         * exclusif: if true then only this cluster will be selected
         */
        select: function(exclusif){
            this.collection.clustering.select(this, exclusif);
        },

        /** Select the curent or just clear selection if curent is already selected
         *
         * exlusif: if true then only this cluster will be selected
         */
        toggle_select: function(exclusif){
            var nb_selected = this.collection.clustering.selected.length;
            if(this.selected){
                if(exclusif && nb_selected >= 2){
                    // si selection exclusive (sans CTRL) et plus de deux selected
                    // alors on select JUSTE ce cluster
                    this.collection.clustering.select(this, true);
                } else {
                    // si non on unselect juste le cluster
                    this.collection.clustering.unselect(this);
                }
            } else {
                // if not select just select the current cluster
                this.collection.clustering.select(this, exclusif);
            }
        },
        
        /** return true if (at least) one cluster is selected
         */
        some_selected: function(){
            return this.selected || this.collection.clustering.some_selected();
        }, 
    });

    /**
     *  A clustering (ie a set of Cluster) over a graph or a list of docs
     */
    //TODO: for now the only entry point to set the data is this.reset
    Cello.Clustering = Backbone.Model.extend({
        defaults: {
            collection: new Backbone.Collection([]),    // the collection of clusters
            doc_membership: {},                         // the membership of each documents
        },

        ClusterModel: Cello.Cluster,       // the model of clusters, may be override in initialize

        initialize: function(attrs, options) {
            attrs = attrs  || {};
            // Getters
            Cello.get(this, 'collection'); // one can acces cluster collection with this.collection
            Cello.get(this, 'selected', this._get_selected); // selected elements
            Cello.get(this, 'elements', this._get_elements); // sorted and filtered elements
            Cello.get(this, 'membership');
            Cello.get(this, 'doc_membership');
            Cello.get(this, 'length', function() { return this.collection.length });

            Cello.get(this, 'roles', this._roles);   // list of active roles (for labels)
            Cello.set(this, 'roles', this._set_roles)

            // override ClusterModel
            this.ClusterModel = attrs.ClusterModel || this.ClusterModel;
            
            //## prepare attributes
            // create (empty) collection of documents
            var collection = new Backbone.Collection([], {
                model: this.ClusterModel,
                clustering: this,
            });
            collection.clustering = this;   //add reference to this in collection
            this.set("collection", collection);
            
            //console.log(this.collection.bind)
            // bind collection change to attribute update
            _.bindAll(this, "_compute_doc_membership", "_compute_membership", "_compute_colors");
            this.listenTo(this.collection, "add remove reset", this._compute_membership);
            this.listenTo(this.collection, "add remove reset change:docnums", this._compute_doc_membership);
            this.listenTo(this.collection, "add remove reset", this._compute_colors);
            //
            //XXX: keep that or not ?
            //this.default_labels();
        },

        /** Returns ellements of the collection (sorted and filtered)
         * note: better to use `this.elements`
         */
        _get_elements: function() {
            var elements = this.collection.models;
            //TODO: add sorting ?
            return elements;
        },

        /** Returns a given cluster
         */
        cluster: function(cid){
            return this.collection.at(cid);
        },

        /** Reset the data from a std cluster model
         *
         * data = {
         *      clusters: [_list_of_clusters_],
         *       misc:_id_of_the_misc_if_any_
         * }
         */
        reset: function(data){
            // set the misc cluster
            _.map(data.clusters, function(cl){cl.misc = false;});
            if (data.misc > -1){
                data.clusters[data.misc].misc = true;
            }
            // reset the collection
            this.collection.reset(data.clusters);
            // by default select all roles
            this.roles = this.all_roles();
            this.trigger("reset");
        },

        /**
         * return true if there is a misc cluster in.clusters
         */
        has_misc: function(){ 
            var is_misc = function(clust){return clust.is_misc();};
            return _.some(this.collection.models, is_misc);
        },

        /** list all availables roles of each labels
         */
        all_roles: function(hidden){
            var roles = [];
            _.each(this.collection.models, function(cluster){
                roles = _.union( roles, cluster.all_roles(hidden) );
            });
            return roles;
        },

        /** list all active roles
         */
        _roles: function(hidden){
            var roles = [];
            _.each(this.collection.models, function(cluster){
                roles = _.union( roles, cluster.roles );
            });
            return roles;
        },

        /** Change the selected roles on each cluster
         */
        _set_roles: function(roles){
            _.each(this.collection.models, function(cluster){
                cluster.roles = roles;
            });
            this.trigger("change:roles");
        },

        /** Compute the vertex membership (ie this.membership)
         */
        _compute_membership: function() {
            // ras
            var membership = {};
            // see all documents of each cluster
            for(var cid in this.collection.models){
                cid = parseInt(cid);
                var cluster = this.collection.at(cid);  //TODO: use this.get_cluster(cid)
                var vids = cluster.get('vids');
                for(var cvid = 0; cvid < vids.length; cvid++) {
                    vid = vids[cvid];
                    if (vid in membership) {
                        membership[vid].push(cid);
                    } else {
                        membership[vid] = [cid];
                    }
                }
            }
            // update it
            this.set("membership", membership);
        },

        /** Compute the document membership (ie this.doc_membership)
         */
        _compute_doc_membership: function() {
            // ras
            var membership = {};
            // see all documents of each cluster
            for(var cid in this.collection.models){
                cid = parseInt(cid);
                var cluster = this.collection.at(cid);  //TODO: use this.get_cluster(cid)
                var docnums = cluster.get('docnums');
                for(var did = 0; did < docnums.length; did++) {
                    docnum = docnums[did];
                    if (docnum in membership) {
                        membership[docnum].push(cid);
                    } else {
                        membership[docnum] = [cid];
                    }
                }
            }
            // update it
            this.set("doc_membership", membership);
        },

        /** Compute the clusters colors
         */
        _compute_colors: function(){
            var nb_clusters = this.length;
            for (var cid in this.collection.models){
                var cluster = this.collection.at(cid);
                var color = [99, 99, 99];
                if(cluster.is_misc() === false){
                    color = Cello.utils.hsvToRgb((cid / nb_clusters * 360)|0, 40, 80);
                }
                cluster.color = color;
            }
        },

        // Note: selection mechanism is very similar to the one in blocks with components and the one in Cello.DocList

        /** get seleced blocks
         * not better use the getter block.selected
         */
        _get_selected: function(){
            return this.collection.where({'selected': true});
        },

        /** return true if (at least) one cluster is selected
         */
        some_selected: function(){
            return _.some(this.collection.models, function(cluster){return cluster.selected});
        },

        /** Select a cluster
         *
         * exclusif: if true then only this cluster will be selected
         */
        select: function(cluster, exclusif){
            //TODO what if the cluster is not in the collection ?
            // si selected ET demande pas l'exclusivité alors que l'on est pas tout seul selected
            if(cluster.selected && !exclusif && this.selected > 1) return;
            // clear selection if exlusif
            if(exclusif){
                this.clear_selection({silent:true});
            }
            // select the doc
            cluster.set('selected', true);
            // triger an event to notify the selection change at doclist level
            this.trigger("change:selected", cluster);
        },

        /** unselect all selected clusters
         */
        clear_selection: function(options){
            var selected = this.selected;
            if(selected.length <= 0) return;
            // unselect all selected
            _.each(selected, function(doc){
                doc.set('selected', false);
            });
            // triger an event to notify the selection change at doclist level
            if( !(options && options.silent)) {
                this.trigger("change:selected");
            }
        },

        /** Unselect a cluster */
        unselect: function(cluster){
            //TODO what if the cluster is not in the collection ?
            if(!cluster.selected) return;
            cluster.set('selected', false);
            // triger an event to notify the selection change at block level
            this.trigger("change:selected");
        },

        //TODO: redécoupage a prévoir
        default_labels: function(){
            // get all the roles
            var roles = this.all_roles();
            // we have labels with roles
            if (roles.length > 0) {
                if(_.contains(roles, this.get('roles')) === false ){
                    //this.set('roles', _.first(roles), {silent:true});
                }
            }

            var _label = function(label, score, role){
                return {
                    label: label,
                    score: score,
                    role: role,
                };
            };

            // set the labels of each clusters
            _.each(this.collection.models, function(cluster){
                var labels = _.union(
                    cluster.get('labels').models,
                    _.map(cluster.get('docnums'), function(label){ 
                            return _label(label, 1, "_docnum");
                    }),
                    _.map( cluster.get('vids'), function(label){ 
                            return _label(label, 1, "_vids");
                    })
                );
                labels = new Backbone.Collection(labels)
                cluster.set('labels', labels, {silent:true});
            });
        }
    });
//==src/core/utils.js==


    Cello.utils = {};
    
    /**
     * Use Backbone Events listenTo/stopListening with any DOM element
     *
     * @param {DOM Element}
     * @return {Backbone Events style object}
     * 
     * You can use it like this:
     * view.listenTo(Cello.utils.asEvents(window), "resize", handler);
     **/
    Cello.utils.asEvents = function(el) {
        var args;
        return {
            on: function(event, handler) {
                if (args) throw new Error("this is one off wrapper");
                el.addEventListener(event, handler, false);
                args = [event, handler];
            },
            off: function() {
                el.removeEventListener.apply(el, args);
            } 
        };
    }
    
    /* converts int colors to css colors
     * >>> css_color( [200,122,10] )
     * "#C87A0A"
     */ 
    Cello.utils.css_color = function( color ){
        var cssc = "#000000";
        if ( color ){
            var convert = function(c){ 
                c = '0'+c.toString(16);
                return c.substring(c.length-2);
            };
            cssc = "#" + _.map(color, convert ).join('');
        }
        return cssc;
    };

    // FIXME webkit-only
    Cello.utils.css_gradient = function(c1, c2) {
        return "-webkit-linear-gradient("+ Cello.utils.css_color(c1)  +","+ Cello.utils.css_color(c2) +")";
    };

    Cello.utils.color_darker = function(color){
        var hsv = Cello.utils.rgbToHsv(color[0], color[1], color[2]);
        return Cello.utils.hsvToRgb(hsv[0],hsv[1],60);
    };

    /**
    * Converts HSV to RGB value.
    *
    * @param {Integer} h Hue as a value between 0 - 360 degrees
    * @param {Integer} s Saturation as a value between 0 - 100 %
    * @param {Integer} v Value as a value between 0 - 100 %
    * @returns {Array} The RGB values  EG: [r,g,b], [255,255,255]
    */
    Cello.utils.hsvToRgb = function(h, s, v) {

        s = s / 100;
        v = v / 100;

        var hi = Math.floor((h/60) % 6);
        var f = (h / 60) - hi;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);

        var rgb = [];

        switch (hi) {
            case 0: rgb = [v,t,p];break;
            case 1: rgb = [q,v,p];break;
            case 2: rgb = [p,v,t];break;
            case 3: rgb = [p,q,v];break;
            case 4: rgb = [t,p,v];break;
            case 5: rgb = [v,p,q];break;
        }

        var r = Math.min(255, (rgb[0]*256) | 0),
            g = Math.min(255, (rgb[1]*256) | 0),
            b = Math.min(255, (rgb[2]*256) | 0);

        return [r,g,b];
    };

    /**
    * Converts RGB to HSV value.
    *
    * @param {Integer} r Red value, 0-255
    * @param {Integer} g Green value, 0-255
    * @param {Integer} b Blue value, 0-255
    * @returns {Array} The HSV values EG: [h,s,v], [0-360 degrees, 0-100%, 0-100%]
    */
    Cello.utils.rgbToHsv = function(red, green, blue) {

        var r = (red / 255),
            g = (green / 255),
            b = (blue / 255);

        var min = Math.min(Math.min(r, g), b),
            max = Math.max(Math.max(r, g), b),
            delta = max - min;

        var value = max,
            saturation,
            hue;

        // Hue
        if (max == min) {
            hue = 0;
        } else if (max == r) {
            hue = (60 * ((g-b) / (max-min))) % 360;
        } else if (max == g) {
            hue = 60 * ((b-r) / (max-min)) + 120;
        } else if (max == b) {
            hue = 60 * ((r-g) / (max-min)) + 240;
        }

        if (hue < 0) {
            hue += 360;
        }

        // Saturation
        if (max === 0) {
            saturation = 0;
        } else {
            saturation = 1 - (min/max);
        }

        return [hue | 0, (saturation * 100) | 0 , (value * 100) | 0];
    };

    /* Add a CSS rule from JS
    */
    Cello.utils.addCSSRule = function(sel, prop, val) {
        var ss, rules;
        for(var i = 0; i < document.styleSheets.length; i++){
            ss    = document.styleSheets[i];
            rules = (ss.cssRules || ss.rules);
            var lsel  = sel.toLowerCase();

            for(var i2 = 0, len = rules.length; i2 < len; i2++){
                if(rules[i2].selectorText && (rules[i2].selectorText.toLowerCase() == lsel)){
                    if(val !== null){
                        rules[i2].style[prop] = val;
                        return;
                    }
                    else{
                        if(ss.deleteRule){
                            ss.deleteRule(i2);
                        }
                        else if(ss.removeRule){
                            ss.removeRule(i2);
                        }
                        else{
                            rules[i2].style.cssText = '';
                        }
                    }
                }
            }
        }

        ss = document.styleSheets[0] || {};
        if(ss.insertRule) {
            rules = (ss.cssRules || ss.rules);
            ss.insertRule(sel + '{ ' + prop + ':' + val + '; }', rules.length);
        }
        else if(ss.addRule){
            ss.addRule(sel, prop + ':' + val + ';', 0);
        }
    };

    /** Helper to force piwik to register the current url
     *
     * This is useful to track 'pushState' that change page url without
     * the whole page.
     * tipicaly when you navigate with backbone router :
     * app.router.navigate("q/"+query);
     * Cello.utils.piwikTrackCurrentUrl();
    */
    Cello.utils.piwikTrackCurrentUrl = function(){
        if (typeof (_paq.push) == 'function') {
            //TODO: track document title
            //piwikTracker.setDocumentTitle(title)
            _paq.push(['setCustomUrl', window.location.href]);
            _paq.push(['trackPageView']);
        }
    };


    return Cello;
}))
