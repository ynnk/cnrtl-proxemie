
(function(root, factory) {
    // reuire.js
    if (typeof define === 'function' && define.amd) {
        // require.js impl 
        define(['cello_core','underscore','backbone','jquery','autocomplete','text!cello_templates/basic.html','text!cello_templates/list.html','text!cello_templates/doclist.html','text!cello_templates/clustering.html','backbone_forms'],
            function(Cello,_,Backbone,$,AutoComplete,templates_basic,templates_list,templates_doclist,templates_clustering) {
              return factory(root,  Cello,_,Backbone,$,AutoComplete,templates_basic,templates_list,templates_doclist,templates_clustering);
        });
    } 
    //FIXME: implements nodejs loading
    //wide scope
    else {
        root.Cello = factory(root, Cello,_,Backbone,$,AutoComplete,templates_basic,templates_list,templates_doclist,templates_clustering);
    }
}(this, function(root, Cello,_,Backbone,$,AutoComplete,templates_basic,templates_list,templates_doclist,templates_clustering) {

//==src/ui/views.js==


    Cello.ui = {};
        
    // helper to get only one template from a cello_templates string
    Cello.ui.getTemplate = function(templates, template_id){
        Cello.log("templates",templates);
        var template = $(templates).filter(template_id).html();
        if(!template){
            console.log("all templates:", templates);
            throw new Error("Template '"+template_id+"' not found");
        }
        return _.template(template);
    };

    // Helper to create a alert msg box
    Cello.ui.getAlert = function(message, title){
        var alert = $('<div></div>');
        if(title){
            alert.append("<strong>"+title+"</strong> ");
        }
        alert.append(message)
            .append('<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>');
        alert.addClass("alert").addClass("alert-danger");
        return alert;
    };

    /* Make a text element "expandable" with a [+] btn
    */
    var split_line_space_re = /(.{80,100}) .*/g;
    Cello.ui.expandable = function($el){
        var full_text = $el.text();
        var text = split_line_space_re.exec(full_text);
        if(text){
            text = text[1];
        } else {
            text = full_text.substring(0,90);
        }
        text += "... ";
        // setup the btn
        var full = false;
        var $btn = $(' <a href="#" class="expand small">[<span class="glyphicon glyphicon-plus small"/>]</a>')
        .click(function(event){
            event.preventDefault();
            if(full){
                console.log("smal");
                $el.find("span.text").text(text);
                $("span", this).removeClass("glyphicon-minus").addClass('glyphicon-plus');
            } else {
                console.log("full");
                $el.find("span.text").text(full_text);
                $("span", this).removeClass('glyphicon-plus').addClass("glyphicon-minus");
            }
            full = !full;
            return false;
        });
        // add all that in the DOM
        $el.empty().append("<span class='text'>"+text+"</span>")
            .append($btn);
    };

    /**  Basic Model for string query
     */
    Cello.ui.QueryModel = Backbone.Model.extend({
        defaults: {
            cellist: null,      // a Cello.engine
            query: "",
            // surfase attr
            loaded: false,      // wheter the curent query is loaded or not
            //TODO: for now loaded only compare the last resieved query
            // to the curent one but it should also be bind to any engine
            // configuration change
        },

        loaded_query: null,

        initialize: function(attrs, opts){
            _.bindAll(this, "set_query", "play_completed");
            // add getter
            Cello.get(this, 'cellist');
            Cello.get(this, 'loaded');
            Cello.get(this, 'query');
            Cello.set(this, 'query', this.set_query);
            // connect to cellist, when play succed => mark the query loaded until it changed
            this.listenTo(this.cellist, "play:complete", this.play_completed)
        },

        // Query setter (mapped to this.query affectation)
        set_query: function(query){
            //TODO: add validate ?
            query = query.trim();
            if(query !== this.query){
                console.log("set_query", query, this.query, this.loaded_query)
                this.set('query', query);
                if(this.loaded){
                    this.set('loaded', false);
                } else if(this.loaded_query === query){
                    this.set('loaded', true);
                }
            }
        },

        // called when engine play is done
        play_completed: function(response){
            if(response.results.query != this.query){
                this.query = response.results.query;
            }
            this.loaded_query = this.query;
            this.set('loaded', true);
        },

        // run the engine
        run_search: function(){
            // Prevents empty query
            if (this.query === "") return false;
            this.trigger('search:loading', this.query);
            this.cellist.play({
                query: this.query,
            }); 
        },
    });

    /**
     *  Basic form view over a QueryModel
     */
    Cello.ui.Query = Backbone.View.extend({
        //note: the template should have an input with class 'query_input'
        template: Cello.ui.getTemplate(templates_basic, '#query_form_tmpl'),

        events: {
            'submit': 'submit',
            //'click .query_randomq': 'randomq',
        },

        initialize: function(attr){
            _.bindAll(this, "update_query", "update_loaded")
            // re-render when the model change
            this.listenTo(this.model, 'change:query', this.update_query);
            this.listenTo(this.model, 'change:loaded', this.update_loaded);
            // getter for the input field
            Cello.get(this, "$input", function(){
                return this.$('input.query_input', this.$el);
            });
            return this;
        },

        // update query value in the input
        update_query: function(){
            this.$input.val(this.model.get('query'));
        },

        // update query value in the input
        update_loaded: function(){
            console.log("loaded", this.model.loaded);
            if(this.model.loaded){
                this.$el.find("[type='submit'] span.glyphicon").remove();
            } else {
                var play_icon = $("<span class='glyphicon glyphicon-play'></span>")
                this.$el.find("[type='submit']").prepend(" ").prepend(play_icon);
            }
        },

        render: function(){
            var data = {
                "label": "search :",
                "placeholder": "Enter a search ...",
                "submit": "search !",
            }
            // settup the template
            this.$el.html(this.template(data));
            // update the query input
            this.update_query();
            this.update_loaded();
            return this;
        },

        /** Return the string of the typed query
         */
        query_str: function(){
            return this.$input.val();
        },

        // exec the search
        submit: function(event){
            event.preventDefault(); // this will stop the event from further propagation and the submission will not be executed
            // note: this is not necessary for Chrome, but needed for FF
            this.model.set("query", this.query_str());
            this.model.run_search();
            //Note: return false to avoid HTML form submit
            event.stopPropagation(); //not always necessary
            return false;
        },
    });
   
   
    /**
     * Make a view hiddable/showable by this $el
     */
    Cello.ui.Showable = function(view, visible) {
        view.is_showable = true;
        view.visible = (visible === undefined) ? true : visible;

        view.hide = function() {
            this.visible = false;
            this.$el.hide();
            return this;
        };

        view.show = function() {
            this.visible = true;
            this.$el.show();
            return this;
        };

        view.toggle = function() {
            if (this.visible) {
                this.hide();
            } else {
                this.show();
            }
            return this;
        };
        
        // update the state of the view
        if(view.visible){
            view.show();
        } else {
            view.hide();
        }
    };


    /**
     *  View over a
     */
    Cello.ui.CollectionSearch = Backbone.View.extend({

        initialize: function(attrs,options) {
            var self = this;
            this.on_select = attrs.on_select || function(model) {
                model.set({'selected': true}); // collection item
            };

            this.listenTo(this.model.collection,'change:selected', function(e) { 
                self.upselected(e);
            });
            this.listenTo(this.model.collection,'reset', function() {
                console.log('Views.CollectionSearch:', "reset");
                attrs.input.val('');
            });

            this.autocomplete = new AutoComplete.View({
                input: attrs.input, // your input field
                model: this.model.collection, // your collection
                onSelect: this.on_select,
            });
            this.autocomplete.render();
        },

        render: function() {
            return this;
        },

        /** Mise a jour de la vue quand un element est selectioné dans le model
         */
        upselected: function(e) {
            console.log('Views.CollectionSearch: selected change, e=' , e);
            console.log('>>> id ', e.cid, "title "  ,e.label() , this.$el, $('input', this.$el));
            $('input', this.$el).val(e.label());
        },
    });


//==src/ui/choice.js==


    /**
     * Choice View
     * **********
     * attributes
     * ==========
     * elements: is a list of possible item selected could also be a function
     * item: acces to a model attributes storing selection
     * callback: function(view) called after an items is clicked
     *            view is the actual clicked item view
     *            use to set a model attributes.
     *
     * Usage
     * =====
     * var choice = new Views.Choice({
     *       elements: function(){return _.keys(self.model.get('sortables'))},
     *       item: function(){return self.model.get('sort_key')},
     *       callback: function(view){
     *           self.model.set({'sort_key': view.model.get('name')});
     *       },
     *   }); //  create item
     */
    Cello.ui.Choice = Backbone.View.extend({
        template: _.template('<div class="choice btn-group"></div>'),

        initialize: function(attrs){
            //XXX: mouve it in Cello.core as val_or_func
            //TODO need tests ! (realy need test !)
            var wrap = function(val_or_func, defaults){
                if( _.isFunction(val_or_func)){
                    return val_or_func
                }
                // TODO un seul "if" ne suffit pas ?
                var val = val_or_func || defaults;
                if ( _.isFunction(val) )
                    return val;
                return function(){return val};
            };
            this.elements = wrap(attrs.elements , []); // [] or function
            this.item = wrap(attrs.item , {} ); // string, {} or function
            this.callback = wrap(attrs.callback , function(){}) ; // function
        },

        render: function() {
            // remove all neested views (ie all btns)
            this.trigger('removeChoiceItems');
            // create default div
            this.$el.html(this.template());
            var $div = this.$el.find("div.choice");
            // create items
            var elements = this.elements(),
                item = this.item();
            for(var k in elements){
                k = parseInt(k);
                var name = elements[k];
                // setup the class
                var classname = 'clickable btn';
                if(name === item) classname += ' active';
                // create btn model
                var btn_view  = new Cello.ui.ChoiceItemBtn({
                    model: new Backbone.Model({name: name}), // need a very simple model
                    className: 'clickable btn'
                });
                btn_view.listenTo(this, 'removeChoiceItems', btn_view.remove);
                btn_view.listenTo(this, 'unactive', btn_view.unactive);
                this.listenTo(btn_view, 'choice:item', this.on_click);
                $div.append(btn_view.render().$el);
            }
            return this;
        },

        on_click: function(event, btn_view) {
            this.trigger('unactive');
            btn_view.active();
            // callback
            this.callback(btn_view.model.get("name")); // callback
        }
    });
    // make it extendable
    Cello.ui.Choice.extend  = Backbone.View.extend;

    /**
     * A simple choice button
     */
    Cello.ui.ChoiceItemBtn = Backbone.View.extend({
        tagName: 'button',
        className: "clickable btn",
        events: {
            'click': 'onclick'
        },

        render: function() {
            this.$el.append(this.model.get('name'));
            return this;
        },

        onclick: function(event){
            this.trigger('choice:item', event, this);
        },

        active: function(){
            this.$el.addClass("active");
        },

        unactive: function(){
            this.$el.removeClass("active");
        },
    });

//==src/ui/list.js==

   
    /** Standard list item view
     *
     * model should have a "selected" property
     */
    Cello.ui.list = {};
    
    Cello.ui.list.ListItemView = Backbone.View.extend({
        tagName: 'li',
        template: _.template("<span><%= label %></span>"),

        initialize: function() {
            _.bindAll(this, ['update_selected']);
            this.listenTo(this.model, 'change:selected', this.update_selected);
            
        },

        render: function() {
            data = this.model.toJSON();
            this.$el.html(this.template(data));
            this.update_selected();
            return this;
        },

        // when the model get selected (or unselected)
        update_selected: function() {
            console.log("update selected", this.model)
            if (this.model.get('selected')) {
                this.$el.addClass('active');
            } else {
                this.$el.removeClass('active');
            }
        }
    });


    /**
     * List View for any model having a "elements" attribut
     */
    Cello.ui.list.ListView = Backbone.View.extend({
        template: _.template("<ul></ul>"),

        item_data: {}, // default aditional data that are given to item view constructor

        initialize: function(options) {
            // attributes
            this.item_data = options.item_data || this.item_data;
            // setup ItemView
            this.ItemView = options.ItemView || Cello.ui.ListItemView;
            // binding to the model
            this.listenTo(this.model, 'reset', this.render);
            this.listenTo(this.model, 'change', this.render);
            
            //Cello.ui.Showable(this);
        },

        /** Render : créer une ItemView pour chaque element du model
        */
        render: function() {
            // call for auto remove on items
            this.trigger('remove');
            // re-render the view
            this.$el.html(this.template());
            var $ul = this.$el.find("ul");
            // build the elements
            var elements = this.model.elements; // we know model is Sortable
            for (var i = 0; i < elements.length; i++) {
                var elmt_model = elements[i];
                var itemview_data = {
                    model: elmt_model,          // the element model
                    list_model: this.model,     // model of the curent view
                    rank: i + 1
                }
                _.extend(itemview_data, this.item_data);
                itemview = new this.ItemView(itemview_data);
                //  create item, register events (remove, click), render
                itemview.listenTo(this, 'remove', itemview.remove);
                // add rendered item
                $ul.append(itemview.render().el);
            }
            // scroll to the begining of the list
            this.$el.scrollTop(0);
            return this;
        },
    });


    /**  Simple button to select one of the possible order of elements in a "Sortable" model
     */
    Cello.ui.list.SortByItem = Backbone.View.extend({
        tagName: "button",
        className: "btn btn-primary",
        template: Cello.ui.getTemplate(templates_list, '#SortByItem_template'),

        initialize: function(options){
            this.sort_by = options.sort_by;
            Cello.assert(this.sort_by in this.model.get("sortables"));
            // binding to the sortable model
            this.listenTo(this.model, "change:sortables", this.render)
            this.listenTo(this.model, "change:sort_key", this.render)
            this.listenTo(this.model, "change:sort_reverse", this.render)
        },

        events: {
            'click': 'on_click',
        },

        // update the model selection
        on_click: function(){
            var current = this.model.get('sort_key');
            var reverse = this.model.get('sort_reverse');
            
            this.model.set({
                'sort_key': this.sort_by,
                'sort_reverse': this.sort_by === current && !reverse
            });
        },

        render: function() {
            var data = {
                "sort_by": this.sort_by,
                "active": this.sort_by === this.model.get('sort_key'),
                "reverse": this.model.get('sort_reverse'),
            };
            this.$el.empty().removeClass("active");
            this.$el.html(this.template(data));
            if(data["active"]){
                this.$el.addClass("active");
            }
            return this;
        },
    });

    /**
     * View to select the order of elements in a "sortable" model
     */
    Cello.ui.list.SortCtrlView = Backbone.View.extend({
        template: Cello.ui.getTemplate(templates_list, '#SortCtrlView_template'),

        initialize: function(options){
            // make the item class configurable
            this.SortByItem = options.SortByItem || Cello.ui.list.SortByItem;
            // binding to the sortable model
            // note: if only sort_key or sort order changed then only the view is re-rendered AND not the subviews
            this.listenTo(this.model, "change:sort_key", this.render);
            this.listenTo(this.model, "change:sort_reverse", this.render);
            this.listenTo(this.model, "change:sortables", this.create_sub_views);
            // create subviews and render
            this.create_sub_views();
        },

        // create all sub views
        create_sub_views: function() {
            // remove all neested views (ie all btns)
            this.trigger('remove');
            this.sub_views = [];
            // create all subviews
            _.each(this.model.get('sortables'), function(_, sort_key, _){
                var btn_view  = new this.SortByItem({
                    model: this.model,
                    sort_by: sort_key,
                });
                btn_view.listenTo(this, 'remove', btn_view.remove);
                btn_view.render();
                this.sub_views.push(btn_view)
            }, this);
            // re render
            this.render();
        },

        // render the views WITHOUT creating subviews (just use it)
        render: function() {
            // render the template
            var data = {
                //just copy sort attrs
                "sort_key": this.model.get("sort_key"),
                "sort_reverse": this.model.get("sort_reverse"),
                "sortings": this.model.get("sortings"),
            }
            this.$el.html(this.template(data));
            // add the subviews
            var $div = this.$el.find(".sortby_items");
            _.each(this.sub_views, function(sub_view){
                $div.append(sub_view.$el);
                sub_view.delegateEvents();
            }, this);
            return this;
        },
    });


    /** Search view with autocomplete inside a list ie. a model that have a "model.elements"
     *
     * by default: it "select" the found item.
     */
    Cello.ui.list.ListSearch = Backbone.View.extend({

        template: Cello.ui.getTemplate(templates_list, '#ListSearch_template'),

        search_in: "label", // default attribute used for search

        initialize: function(options) {
            this.search_in = options.search_in || this.search_in;
            _.bindAll(this, ["on_select"]);
            this.render()
        },

        render: function() {
            var data = {
                label: "search",    //TODO use attr for that
                placeholder: "search within the restults", //TODO use attr for that
            };
            this.$el.empty().html(this.template(data));
            // add autocomplete
            var $input = this.$el.find(".search_input");
            this.autocomplete = new AutoComplete.View({
                input: $input, // your input field
                model: this.model.collection, // your collection
                searchIn: this.search_in,
                onSelect: this.on_select,
            });
            this.autocomplete.render();
            return this;
        },

        // select a document
        on_select: function(document){
            this.model.clear_selection();
            this.model.select(document);
        },
    });

//==src/ui/engine.js==


    var Models = {}, Views = {};

    /**
     *  Model between a component (list of option) and a forw view
     */
    Models.FormModel = Backbone.Model.extend({
        initialize: function(attrs, options){
            this.component = options.component;
            _.bindAll(this, "update_component", "update_from_component");
            this.listenTo(this, 'change', this.update_component);
            this.listenTo(this.component, 'change:options', this.update_from_component);
            this.update_from_component();
        },

        /** Set option values of the component
         */
        update_component: function(){
            var attrs = this.attributes;
            for(var opt_name in attrs){
                this.component.set_option(opt_name, attrs[opt_name]);
            }
        },

        /** update model values form the component options
         *
         * note: a event "change_from_elsewhere" is triggered if a change realy
         * apprear here. This allows the Backbone.Form view above this model
         * to be re rendered only if a change cames from elsewhere.
         * see OptionableView.
         */
        update_from_component: function(){
            var _this = this;
            var changed = false;
            _.each(this.component.options.models, function(model){
                var name = model.name;
                //console.log(name, String(_this.get(name)), String(model.value))
                if(String(_this.get(name)) !== String(model.value)){
                    //Note: comparaison is made on string value
                    // because there is an issue with Boolean that cames from
                    // the form in a string type, not booleand
                    changed = true;
                }
                _this.set(name, model.value);
            });
            if(changed){
                this.trigger("change_from_elsewhere");
            }
        },
    });

    /**
     *  FormView of an Optionable
     */
    Views.OptionableView = Backbone.View.extend({
        className: "optionable",

        events: {
            //Note: the click is trigger as an event to allow to bind somewhere above, 
            // typicaly in ComponentPane as component selection
            'click': function(){
                this.trigger("clicked");
            },
        },

        initialize: function(attrs, options){
            this.template = _.template($("#KebOptionable").html());
            this.form = null;

            var _this = this;

            // create the data model for the form
            this.form_model = new Models.FormModel(
                {}, {component: this.model}
            )

            // binding to the model
            this.listenTo(this.model, "change:selected", this.update_select)
            // note: re-render when options changed (but not if the change cames
            //  from the form view)
            this.listenTo(this.form_model, 'change_from_elsewhere', this.render);
        },

        render: function(){
            // trigger event to remove all sub views
            this.trigger("remove_subviews")
            // clear the dom
            this.$el.empty();
            // ... then build the view
            var tmpl = {
                name: this.model.name,
                help: this.model.doc,    //TODO help better than doc
            };
            // render the template
            this.$el.append(this.template(tmpl));
            // append the form
            if(this.model.options.size() > 0){
                var form = this.get_form();
                form.render();
                form.listenTo(this, "remove_subviews", form.remove)
                this.$el.append(form.el);
            }
            this.update_select();
            return this;
        },

        // add/remove 'active' class
        update_select: function(){
            if(this.model.selected){
                this.$el.addClass('active');
            } else {
                this.$el.removeClass('active');
            }
        },

        // build Form (view and model) from the component
        get_form: function(){
            // build the form config from options
            var schema = {};    // form schema
            var _this = this;
            _.each(this.model.options.models, function(model){
                var name = model.name;
                schema[name] = _this.to_form_schema(model);
            });
            
            // create the form itself
            var form = new Backbone.Form({
                // change on the view form data are not set to the component model
                events: {
                    'change': function(){console.log("form event", arguments); this.commit()}
                },
                //Schema
                schema: schema,
                //Model + data to populate the form with
                model: this.form_model,
            });
            return form;
        },

        // Create a Backbone.Form schema from an Cello.Option
        to_form_schema: function(option_model){
            var type_mapping = {
                'Numeric': 'Number',
                'Text': 'Text',
                'Boolean': 'Radio',
            };

            var schema = {};
            var validators = [];
            var otype = option_model.otype;

            schema.label = option_model.name;
            schema.title = otype.help;

            schema.type = type_mapping[otype.type];

            if(otype.choices && otype.choices.length){
                schema.type = 'Select';
                schema.options = otype.choices;
            }

            if(schema.type === 'Radio'){
                schema.options = [true, false];
            }
            return schema;
        },
         
    });

    //TODO rename it BlockView
    /**
     *  View of a Block
     *
     * associated model is Cello.Block
     */
    Views.ComponentPane = Backbone.View.extend({
        className: 'opt_panel',

        events: {
            'click .done': 'hide',
        },

        initialize: function(attrs, options){
            this.template = _.template($("#KebComponentPane").html());
            // make the view showable/hidable
            Cello.ui.Showable(this, options ? options.visible: false);
        },

        render: function(){
            var _this = this;
            var tmpl = {
                val: this.model.name,
                value: this.model.name,
                label: this.model.name,
            };
            this.$el.append(this.template(tmpl));
            var $cont = $("<div class='optionables'></div>");
            _.each(this.model.components.models, function(component, index, list){
                var optionable_view = new Views.OptionableView({
                    model: component
                });
                // bind the selection/click
                optionable_view.listenTo(component, 'change:selected', optionable_view.upselect);
                optionable_view.listenTo(optionable_view, 'clicked', function(){
                    _this.model.select(component);
                });
                // render the view (and append it)
                $cont.append(optionable_view.render().el);
            });
            this.$el.append($cont);
            return this;
        },
    });


    //TODO: rename it EngineView
    /**
     * Full view over a Cello engine
     */
    Views.Keb = Backbone.View.extend({
        events: {
            'click .getmodel': 'getmodel',
            'click .state': 'state',
            'click .isvalid': 'isvalid',
            'click .set_defaults': 'set_defaults',
            'click .reset': 'reset',
            'click .fetch': 'fetch',
        },

        initialize: function(){
            _.bindAll(this, ['set_defaults']);
            // prepare helper links
            $helpers = $('.helpers', this.$el);
            if($helpers){
                $helpers.append(_.map(_.values(this.events), function(e){
                    return "<a href='#' class='"+e+"'>"+e+"</a>";
                }).join(' - '));
            }
            // binding to the model
            this.listenTo(this.model.blocks, 'reset', this.render);
            this.listenTo(this.model.blocks, 'reset', this.set_defaults);
        },

        fetch: function(){
            this.trigger('removeAll');
            this.model.fetch({parse:true});
        },

        render: function(){
            var _this = this;
            var $optbuttons = $('.optbuttons', this.$el);
            var $blocks = $('.blocks', this.$el);
            // for each block
            _.each(this.model.blocks.models, function(block, index, list){
                // create the ComponentPane
                var itempane = new Views.ComponentPane({
                        model: block,
                    },{
                        visible: false,
                    }
                );
                // bind it and add it to DOM
                if($blocks){ // add blocks pane
                    itempane.listenTo(_this, 'removeAll', itempane.remove); // listento remove calls
                    itempane.listenTo(_this, 'hideAll', itempane.hide);
                    $blocks.append( itempane.render().el );
                }
                // add buttons
                if($optbuttons){ // add button
                    var itembtn = new Views.BlockButton({
                        model: block,
                        view: _this,
                        pane: itempane,
                    });
                    itembtn.listenTo(_this, 'removeAll', itembtn.remove); // listento remove calls
                    itembtn.listenTo(_this, 'hideAll', itembtn.unactive);
                    $optbuttons.append(itembtn.render().el);
                }
            });
            return this;
        },

        /* helper functions */
        getmodel: function(){console.log('Keb', 'getmodel', this.model);},
        state: function(){console.log('Keb', 'state', this.model.state());},
        isvalid: function(){console.log('Keb', 'isvalid', this.model.is_valid());},
        set_defaults: function(){},
        reset: function(){ this.model.reset_selections(); },
    });


    /**
     * Button view over a block
     */
    Views.BlockButton = Backbone.View.extend({
        className: 'btnopt',

        events:{
            'click': 'toggle',
        },

        attributes: {
            max_chars: 20,
        },
        /**
         * attributes that should be given :
         *  * model : the Cello.Block model
         *  * pane : the ComponentPane
         *  * view : the Keb (view)
         */
        initialize: function(attrs){
            this.model = attrs.model;
            this.pane = attrs.pane;
            this.view = attrs.view;
            this.template = _.template($("#KebButton").html());
            this.listenTo(this.model, 'change:selected', this.update_selected);
        },

        render: function(){
            var tmpl = {
                name: this.model.name,
            };
            this.$el.append( this.template(tmpl) );
            this.update_selected()
            return this;
        },

        // Update the name of selected component
        update_selected: function(){
            //@console.log("Views.KebButton","render", this.model);
            // render update just the 
            var sel = this.model.selected;
            var val;
            if(sel.length === 0) {
                val = "...";
            } else {
                val = _.pluck(sel, 'name').join(', ');
                if(sel.length > 1) {
                    val = "(" + sel.length + ") " + val;
                }
            }
            val = val.substring(0, this.attributes.max_chars);
            $(".value", this.$el).html(val);
            return this;
        },

        // update selection
        toggle: function(){
            console.log('toggle', this.pane.visible);
            if(this.pane.visible){
                this.pane.hide();
                this.unactive();
            }
            else{
                this.view.trigger('hideAll');
                this.pane.show();
                this.$el.addClass('active');
            }
            return this;
        },

        unactive: function(){
            this.$el.removeClass('active');
            return this;
        }
    });

    Cello.ui.engine = Views;

//==src/ui/clustering.js==


/**
 * Clustering views
 * 
 * Clustering views show each cluster's item
 * 
 * A ClusterItem is a cell that might contains:
 *      # vids of the graph vertex belonging to that cluster
 *      # docnums for the document that are part of this cluster
 *      # labels take from document attributes or vertex labels
 * 
 * Clustering views might also embed a Choice  to switch over different labelling.
 * 
 * 
 * 
 
 */
    
    /* Views Clustering */
    var clustering = {};

    /** View connected to a Cello.Clustering Model that show one pastille by cluster
     */
    clustering.ClusterPastille = Backbone.View.extend({
        tagName: 'li',
        className: 'pastille',

        events: {
            "click a": "clicked",
        },

        clicked: function(event){
            // NOT exclusif selection (i.e. they may have more than one cluster selected)
            // if there is CRTL pressed OR click with middle button
            var exclusif = !(event.ctrlKey || event.button === 1);
            this.model.toggle_select(exclusif);
            return false; // stop propagation and html click
        },

        render: function(){
            var color_html = Cello.utils.css_color(this.model.color);
            var pastille = $("<a href='#'>&nbsp;</a>");
            pastille.css("background-color", color_html)
                .css("border-radius", "1em")
                .css("padding-right", "0.8em")
                .css("font-size", "1em")
            this.$el.html(pastille);
            return this;
        },
    });


    /** View connected to a Cello.Clustering Model that shows, for one document,
     * one pastille by cluster
     */
    clustering.ClusteringPastillesView = Backbone.View.extend({
        tagName: 'ul',

        docnum: null,       // the docnum

        initialize: function(options) {
            // TODO ensure there is a docnum given
            this.docnum = options.docnum;
            this.listenTo(this.model, 'reset', this.render);
            this.listenTo(this.model, 'change:doc_membership', this.render);
            this.render();
        },

        render: function(){
            // remove call 
            this.trigger('removePastilles'); // call for auto remove on items
            // clusters
            var $div, elements, pastille;
            var cids = this.model.doc_membership[this.docnum] || []
            for (var i in cids) {
                var clust = this.model.cluster(cids[i]);
                pastille = new clustering.ClusterPastille({
                    model: clust
                });
                pastille.listenTo(this, 'removePastilles', pastille.remove); // listento remove calls
                this.$el.append(pastille.render().el); // add rendered item
            }
            return this;
        },
    });


    /** Default view for one cluster label
     */
    clustering.LabelView = Backbone.View.extend({
        className: 'clabel',
        tagName: 'li',

        // fallback template
        template: _.template("<a href='#' class='' style='font-size:<%= size %>px' ><%= label %></a> "),

        defaults: {
            cluster: null,
        },

        render: function(){
            var data = this.model.toJSON();
            data = this.before_render(data);
            this.$el.html(this.template(data));
            return this;
        },

        /**  May be override to process model data before template rendering
         */
        before_render: function(data){
            return data
        },
    });


    /** Show label of a cluster, for a given role
    */
    clustering.ClusterItem = Backbone.View.extend({
        className: 'cluster',
        tagName: 'div',

        template: _.template("<ul class='label_list'></ul>"),

        LabelView: clustering.LabelView,

        events: {
            "click": "clicked",
        },

        initialize: function(options){
            // setup LabelView
            this.LabelView = options.LabelView || this.LabelView;
            // binding
            // if cluster selection changed
            if(this.model.collection && this.model.collection.clustering){
                // if there is a collection of cluster bind to it
                //XXX: c'est affreux ce 'this.model.collection.clustering'
                this.listenTo(this.model.collection.clustering, "change:selected", this.update_selected);
            } else {
                // else only bind to model selected change
                this.listenTo(this.model, "change:selected", this.update_selected);
            }
            // if labels or active roles changed then re-render just the labels
            this.listenTo(this.model, "change:labels", this.render_labels);
            this.listenTo(this.model, "change:roles", this.render_labels);
        },
        
        /** When clicked, just toggle the selection in the model
         */
        clicked: function(event){
            // NOT exclusif selection (i.e. they may have more than one cluster selected)
            // if there is CRTL pressed OR click with middle button
            var exclusif = !(event.ctrlKey || event.button === 1);
            this.model.toggle_select(exclusif);
        },
        
        //override remove to remove subviews
        remove: function() {
            this.trigger('removeSubViews'); // call for auto remove on labels
            Backbone.View.prototype.remove.apply(this, arguments);
        },

        /** Render the item and then all the labels neested views
         */
        render: function(){
            this.render_item();
            this.render_labels();
            return this;
        },

        render_item: function(){
            // basic template :
            var data = {}
            _.extend(data, this.model.toJSON());
            this.$el.html(this.template(data));
            // gradient background
            var color = this.model.color;
            // donner la couleur direct en CCS fait que c'est dur doverridé...
            color = Cello.utils.css_color(color);
            //this.$el.css("background-image", Cello.utils.css_gradient(color, Cello.utils.color_darker(color)) );
            this.$el.css("background-color", color);
            // add a class if misc
            if(this.model.misc){
                this.$el.addClass("misc");
            }
            return this;
        },

        render_labels: function(){
            var _this = this;
            // clear
            this.trigger('removeSubViews'); // call for auto remove on labels
            var $label_list = this.$el.find("ul.label_list");
            $label_list.empty();
            // get and add View on each label
            var labels = this.model.get_labels()    // by default returns the selected roles
            _.each(labels, function(lab) {
                labview = new _this.LabelView({
                    model: lab,
                    cluster: _this.model,
                });
                labview.listenTo(_this, 'removeSubViews', labview.remove);
                $label_list.append(labview.render().el);
            });
            return this;
        },

        /** Called when the model 'selection' changed
         *
         * The complexity in this function is that when no cluster are selected
         * then cluster view should have no special class, but if an other
         * cluster is selected then it should have a class 'unactive'
         */
        update_selected: function(){
            if (this.model.selected) {
                this.$el.addClass('active');
                this.$el.removeClass('unactive');
            } else {
                this.$el.removeClass('active');
                if(this.model.some_selected()){
                    this.$el.addClass('unactive');
                } else {
                    this.$el.removeClass('unactive');
                }
            }
        },
    });

    /* View that select active "role" of labels of a Clustering model
    */
    clustering.LabelRolesSelector = Backbone.View.extend({
        events:{
            'click .btn': "btn_clicked",
        },

        initialize: function(){
            // re-render when roles change
            this.listenTo(this.model, "change:roles", this.render);
        },

        btn_clicked: function(e){
            //hack: Toggle by hand the button to be sure it is toggle when set the model
            e.stopImmediatePropagation()
            $(e.target).button('toggle');

            // get selected roles
            var roles = []
            _.each(this.$el.find(".btn.active"), function(btn){
                roles.push($(btn).data("role"));
            });
            this.model.roles = roles;
        },

        render: function(){
            var $btns = $('<div class="btn-group" data-toggle="buttons"></div>')
            var active_roles = this.model.roles;
            _.each(this.model.all_roles(), function(role){
                // render each role btn
                var _btn_tmpl = _.template('<label class="btn btn-primary <%=active%>" data-role="<%=role%>"><input type="checkbox"> <%=role%> </label>')
                var data = {
                    role: role,
                    active: active_roles.indexOf(role) >= 0 ? "active" : "",
                };
                $btns.append(_btn_tmpl(data));
            }, this)
            // reset the element
            this.$el.empty().append($btns);
            return this;
        },
    });

    //************************************************************************

    //XXX should be splitted in 2 views
    //TODO: recupéré les role selector dans un vue a part
    clustering.ClusteringPane = Backbone.View.extend({
        ClusterView: clustering.ClusterItem,

        initialize: function(options) {
            Cello.ui.Showable(this);
            
            this.ClusterView = options.ClusterView || this.ClusterView;
            
            var _this = this;
            // TODO choice if container is given in options.$choice
            this.choice = new Cello.ui.Choice({
                className: 'choice btn-group',
                elements: function(){return _this.model.all_roles()},
                item: function(){return _this.model.get('roles')[0]},   //XXX: only one role possible
                callback: function(view){
                    _this.model.set({'roles': view.model.get('name')});
                },
                toggle_class: 'bold',
            }); //  create labels choice

            this.listenTo(this.model, 'reset', this.setup);
            this.listenTo(this.model, 'clustering:ready', this.setup);
            this.listenTo(this.model, 'change:roles', this.render);

            this.render();
        },

        setup: function(){
            // label choice
            this.choice && this.$(".header",this.$el).append( this.choice.render().$el );
            this.render();
        },

        render: function(){
            var _this = this;
            // remove call 
            this.trigger('removeSubViews'); // call for auto remove on items
          
            // clusters
            var $div, elements, itemview;
            $div = $(".clusters", this.$el);
            elements = this.model.collection.models;//XXX: should not have to acces collection
            for (var i in elements) {
                var clust = elements[i];
                itemview = new this.ClusterView({
                    model: clust, 
                    role: this.model.get('role'),
                }); //  create item
                                    
                itemview.listenTo(this, 'removeSubViews', itemview.remove); // listento remove calls

                $div.append(itemview.render().el); // add rendered item
            }
            this.$el.append($div);
            return this;
        },
    });

    Cello.ui.clustering = clustering;

//==src/ui/doclist.js==


    var doclist = {};

    /** ItemView over a Cello.Doc
     *
     * This view is made to be use in a Cello.ui.list.ListView.
     * It may be extend.
     */
    doclist.DocItemView = Cello.ui.list.ListItemView.extend({
        tagName: 'li',      //'li' because it should be use in a 'ul' of (Cello.ui.list.ListView)
        template: Cello.ui.getTemplate(templates_doclist, '#DocItemView_template'),

        initialize: function(options){
            // super call 
            doclist.DocItemView.__super__.initialize.apply(this);
            // override
            _.bindAll(this, 'flags_changed');
            this.bind_to_model();
        },

        /** automatic binding of the view to the model
         *
         * Called in the init
         * may be overriden
         */
        bind_to_model: function(){
            this.listenTo(this.model, "addflag rmflag", this.flags_changed);
        },

        render: function(){
            // super call 
            doclist.DocItemView.__super__.render.apply(this);
            // add flags/class
            this.set_flags();
            return this;
        },

        // flags are transformed to CSS classes
        flags_changed: function(){
            var previous_flags = this.model.previous("flags");
            _.each(previous_flags, function(flag){
                this.$el.removeClass(flag);
            }, this);
            this.set_flags();
        },

        // copy the model flags to CSS classes
        set_flags: function(){
            var flags = this.model.flags;
            _.each(flags, function(flag){
                this.$el.addClass(flag);
            }, this);
        },
        
        // scrool to the item
        scroll_to: function(){
            var parent_div = this.$el.parent("ul").parent();
            parent_div.animate({
                scrollTop: parent_div.scrollTop() + this.$el.position().top - 1,
            }, 100);
        },
    });


    /**  ItemView over a Cello.Doc with cluster pastilles
     *
     *  This view is also linked to a clustering model
     * and on each documents are managed pastilles
     */
    doclist.DocPastilleItemView = doclist.DocItemView.extend({
        template: Cello.ui.getTemplate(templates_doclist, '#DocPastilleItemView_template'),

        // this additional models should be given in initialize
        clustering_model: null,    // permit to build the neested cluster pastille view

        initialize: function(options){
            // super call 
            doclist.DocPastilleItemView.__super__.initialize.apply(this);
            // setup custom attr
            Cello.assert(options.clustering_model, "DocPastilleItemView should know a clustering model");
            this.clustering_model = options.clustering_model;
        },

        /** Render the document 
         *
         * overiden to manage cluster pastilles
         */
        render: function(){
            // super call 
            doclist.DocPastilleItemView.__super__.render.apply(this);
            // add pastille view
            var pastilles = new Cello.ui.clustering.ClusteringPastillesView({
                model: this.clustering_model,
                docnum: this.model.docnum,
            });
            // add the view in DOM
            this.$el.find(".pastilles").append(pastilles.el)
            return this;
        },
    });


    Cello.ui.doclist = doclist;


    return Cello;
}))
