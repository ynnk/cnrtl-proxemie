(function(root, factory) {
    // require.js
    if (typeof define === 'function' && define.amd) {
        // require.js impl 
        define(['underscore', 'jquery', 'backbone', 'exports'], function(_, $, Backbone, exports) {
              return factory(root,  Backbone, _, $);
        });
    } 
    //FIXME: implements nodejs loading
    //wide scope
    else {
        root.Cello = factory(root, Backbone, _, $);
    }
}(this, function(root, Backbone, _, $) {

    var AutoComplete = {};

    AutoComplete.Collection = Backbone.Collection.extend({
        model : Backbone.Model.extend({}),
        
        update_data: function(data){return data},
        
        parse: function(data){
            return data.results.response ? data.results.response.complete : [];;
        },

        fetch: function(options) {                    
            options || (options = {});
            var data = (options.data || {});
            options.type = 'POST';
            options.data = this.update_data(data);
            return Backbone.Collection.prototype.fetch.call(this, options);
          }, 
    });
    
    AutoComplete.ItemView = Backbone.View.extend({
        tagName: "li",
        template: _.template('<a class="" href="#"><%= label %></a>'),
        
        initialize: function(attrs, options){
            this.parent = attrs.parent;
        },

        events: {
            "click": "select",
            // TODO gerer le mouse over comme le clavier
        },

        render: function () {
            this.$el.html(this.template({
                "label": this.model.get(this.parent.searchIn),
            }));
            return this;
        },

        select: function () {
            this.parent.hide().select(this.model);
            return false;
        }

    });

    AutoComplete.View = Backbone.View.extend({
        tagName: "ul",
        className: "autocomplete",

        searchIn: "label", //default attribut to search in models
        wait: 300,
        queryParameter: "query",
        minKeywordLength: 2,
        currentText: "",
        itemView: AutoComplete.ItemView,
        filter_startswith : true,
        filter_indexof : true,

        initialize: function (attrs) {
            _.extend(this, attrs);
            this.filter = _.debounce(this.filter, this.wait);
        },

        render: function () {
            // disable the native auto complete functionality
            this.input.attr("autocomplete", "off");

            this.input
                .keyup(_.bind(this.keypress, this))
                .keydown(_.bind(this.keydown, this)) // XXX bind jquery
                .after(this.$el);
            return this;
        },

        keydown: function (event) {
            if (event.keyCode == 38) return this.move(-1);
            if (event.keyCode == 40) return this.move(+1);
            if (event.keyCode == 13) return this.onEnter();
            if (event.keyCode == 27) return this.hide();
        },

        keypress: function(event) {
            console.log(event);
            this.refresh()
        },
        
        refresh:function(){
            var keyword = this.input.val();
            if (this.isChanged(keyword)) {
                if (this.isValid(keyword)) {
                    console.log('AutoCompleteView', 'refresh', this.currentText, ',', keyword,this.isChanged(keyword), this.isValid(keyword) );
                    this.filter(keyword);
                } else {
                    this.hide()
                }
            }
        },

        filter: function (keyword) {
            var self = this;
            //console.log('AutoCompleteView', 'filter', this.model, keyword);
            if (this.model.url) {
                var parameters = {};
                parameters[this.queryParameter] = keyword;

                this.model.fetch({
                    success: function () {
                        this.loadResult(self.model.models, keyword);
                    }.bind(this),
                    data: parameters
                });

            } else {
                keyword = keyword.toLowerCase();
                _(this.model.models).chain()
                    .map( function(model){
                    // startswith
                    if ( self.filter_startswith && model.get(self.searchIn).toLowerCase().lastIndexOf(keyword, 0) === 0 )
                        model.set('score', 2);
                    // contains
                    else if ( self.filter_indexof && model.get(self.searchIn).toLowerCase().indexOf(keyword) !== -1)
                        model.set('score', 1);
                    else model.set('score', 0);
                });
                var elements = _.sortBy(this.model.models, function(model){ return model.get('score') *-1 });
                    elements = _.filter( elements , function(model){ return model.get('score') > 0 });
                this.loadResult( elements , keyword);
            }
        },

        isValid: function (keyword) {
            return keyword.length >= this.minKeywordLength
        },

        isChanged: function (keyword) {
            return this.currentText != keyword;
        },

        move: function (position) {
            var current = this.$el.children(".active"),
                siblings = this.$el.children(),
                index = current.index() + position;
            if (siblings.eq(index).length) {
                current.removeClass("active");
                siblings.eq(index).addClass("active");
            }
            return false;
        },

        onEnter: function () {
            this.$el.children(".active").click().removeClass("active");
            return false;
        },

        loadResult: function (models, keyword) {
            this.currentText = keyword;
            this.show().reset();
            if (models.length) {
                _.forEach(models, this.addItem, this);
                this.move(1);
                this.show();
            } else {
                this.hide();
            }
        },

        addItem: function (model) {
            var self = this;
            this.$el.append(new this.itemView({
                model: model,
                parent: self
            }).render().$el);
        },

        select: function (model) {
            var label = model.get(this.searchIn);
            this.input.val(label);
            this.currentText = label;
            this.onSelect(model);
        },

        reset: function () {
            this.$el.empty();
            return this;
        },

        hide: function () {
            this.$el.hide();
            return this;
        },

        show: function () {
            this.$el.show();
            return this;
        },

        // callback definitions
        onSelect: function () {}

    });

    return AutoComplete;
}));
