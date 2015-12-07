
(function(root, factory) {
    // reuire.js
    if (typeof define === 'function' && define.amd) {
        // require.js impl 
        define(['cello_core','underscore','backbone','jquery','threejs','tween'],
            function(Cello,_,Backbone,$,THREE,TWEEN) {
              return factory(root,  Cello,_,Backbone,$,THREE,TWEEN);
        });
    } 
    //FIXME: implements nodejs loading
    //wide scope
    else {
        root.Cello = factory(root, Cello,_,Backbone,$,THREE,TWEEN);
    }
}(this, function(root, Cello,_,Backbone,$,THREE,TWEEN) {

//==src/gviz/gviz.js==


/**
 * Requires:
 *   underscore # as _
 *   backbone   # as Backbone
 *   threejs    # as THREE
 *   cello_core # as Cello
 * 
 * Usage:
 * >>> 
    models.vizmodel= new Models.GVizModel({});
    
    // creates visualisation object
    views.vz_threejs_main = new gviz.ThreeViz({ el: "#vz_threejs_main",
                    model : models.vizmodel,
                    width :$('#vz_threejs_main').width(),
                    height: $('#vz_threejs_main').height(),
                    wnode_scale:wnode_scale, // node scaling function
    })
    .enable()
    .animate(); // rendering loop
**/

var gviz = {}

// FIXME : three is not amd-ready
var THREE = window.THREE;
var TWEEN = window.TWEEN

gviz.VizModel = Backbone.Model.extend({
    defaults: {
        graph: null,
        show_nodes : true,
        show_edges : true,
        show_text  : true,
        last_selected: [],
        selected: [],
        intersected: null, // int
        last_intersected: null, // int
        conf : 0
    },
    
    initialize: function(){
        Cello.debug("GvizModel", this.attributes);
        Cello.get(this, "graph");
        Cello.get(this, "selected");
        Cello.get(this, "last_selected");
        Cello.get(this, "last_intersected");
    },

    set_selected: function(node_idx_list){
    /* Set a list of node indexes  [idx, ] to selection. 
     * Empty list will reset selection
     * @param node_idx_list: [int, ..] indexes of nodes to select
     */
        node_idx_list = _.isArray(node_idx_list) ? node_idx_list : [node_idx_list];
        var sorted = _.sortBy(node_idx_list, function(i){return i;});
        if ( _.isEqual( this._selected, node_idx_list ) === false ){
            this.add_selected(node_idx_list, true);
        }
    },

    // <void> model.add_selected([vertices], reset_before_add=false )
    add_selected: function(node_idx_list, reset_before_add ){
        /**
         * Add a list of nodes [jsnode, ...] to selection. Empty list will reset selection
         *  setting node_idx_list to [] or null will reset selection
         *  setting reset_before_add to true, will actually means 'set'
         * @param node_idx_list: list of node's indices
         * @param reset_before_add:  will reset selection before add,
         */
         
        var reset = reset_before_add === undefined ? false : reset_before_add;
        var selected = this.get('selected'); // idx list
        //node_idx_list = _.isArray(node_idx_list) ? node_idx_list : [node_idx_list];
        node_idx_list = _.chain(node_idx_list).sortBy(function(i){return i;}).value();
        
        if ( ( _.isEmpty(node_idx_list) || node_idx_list == null) 
            && this.get('selected').length === 0) {
        
            this.set('last_selected', selected );
            this.set('selected', []);
        }
        
        else if ( _.isObject(node_idx_list) ){
            var _selected = _.chain(node_idx_list)
                            .union(reset ? [] : selected) // reset if needed
                            // keep sorted to handle is_selected faster
                            .sortBy(function(i){return i;}).value();

            if ( _.isEqual(selected, _selected ) === false ){ // update only if different
                this.set('last_selected', selected);
                this.set('selected', _selected);
            }
        }
        
        selected = this.get('selected');
        var last_selected = this.get('last_selected');
        var _this = this;
          // remove flag actif on missing
        _.each(_.difference(last_selected, selected), function(id){
            var graph = _this.get('graph');
            var vertex = graph.vs.get(id);
            vertex.remove_flag("active");
        });
        // add flag on new ones
        _.each(_.difference(selected, last_selected), function(id){
            var graph = _this.get('graph');
            var vertex = graph.vs.get(id);
            vertex.add_flag("active");
        });
                
    },

    is_selected: function(nodeidx){
        /** tells wether a node is selected
         *@param nodeidx : int index of node
         *>>> graph.is_selected(jsnode.idx)
         */
        return nodeidx == null ? false : _.indexOf(this.get('selected'), nodeidx, true) > -1;
    },

    set_intersected: function(intersect_id){
        var intersected = this.get('intersected');
        if ( intersected != intersect_id) {
            this.set('last_intersected', intersected);
            this.set('intersected', intersect_id);
        }
    },

});

/*
Features

* no selection on mouseup after rotation

*/


/**
* @param viz_div_id: <str> DOM id of element that will contain the vizu
* @param parameters : {} parameters and callback functions
*
* *Parameters:*
* width : <int> width of canvas
* height : <int> height of canvas
*
* renderNode : <void>function( threejs_view_viz, particle_pid, canvas_context )
*              draw a vertex/partcle on the canvas
* wnode_scale: <int>function(jsnode)
*              return scale of vertex/particule (1 by default for all node).
*
* edges_color : int color value ex: 0xFF4300
*
* setgraph_callback : <void>function(threejs_view_viz)
*               called after wmodel and scene are built.
*/
gviz.ThreeViz = Backbone.View.extend({

    initialize: function(attrs, options){
        var _this = this;

        this.graph  = null; // JSGraph
        this.wnodes = [];
        this.wedges = [];

        this._inited = false;       // true if the view has been well initialized (_init)
        this._debug = false;

        // FIXME goto model
        this.options = {};

        /* Parametrable attributes */
        
        // Width an height
        this._width = attrs['width'] || -1;     // < 0 means that we take the width of the $el
        this._height = attrs['height'] || -1;
        Cello.get(this, "width", function(){
            return _this._width > 0 ? _this._width : _this.$el.width();
        });
        Cello.get(this, "height", function(){
            return _this._height > 0 ? _this._height : _this.$el.height();
        });

        // callable( viz, pid, context )
        this.render_node = attrs['render_node'] || gviz.ThreeVizHelpers.render_node; 

        this.wnode_scale = attrs['wnode_scale'] || gviz.ThreeVizHelpers.wnode_scale;
        this.text_scale = attrs['text_scale'] || 0.12;
        //console.log("text_scale", this.text_scale)
        
        this.clear_color = attrs['background_color'] || 0xFFFFFF;
        this.edges_color = attrs['edges_color'] || 0xFF0000;
        
        this.setgraph_callback = attrs['setgraph_callback'] || function(viz){};

        // interactive model ?
        this.WINDOWVISIBLE = true; // whether the window is visible
        this.MOUSEONCANVAS = false; // whether the mouse is over the canvas
        this.MOUSEDOWN = false;
        this.MOUSEHASMOVED = false;
        
        this.ANIMATE = false;
        
        return this;
    },

    /** Setup html container and adds events listener on divs
     *
     * @return viz
    */
    enable: function(){
        var _this = this;
        var $container = this.$el;
        //$container.css({"width": this.width+"px", 'height':this.height+'px'});
        //$container.html(gviz.ThreeVizHelpers.HTML);

        //$("div.layer_conf", $container).click(function(){
            //$(".layer_conf_panel", container).toggle();});
        //$("#vz_opt_show_nodes", $container).click(function(){ 
            //_this.options.show_nodes = !_this.options.show_nodes; });
        //$("#vz_opt_show_edges", $container).click(function(){ 
            //_this.options.show_edges = !_this.options.show_edges; });
        //$("#vz_opt_show_text", $container).click(function(){ 
            //_this.options.show_text = !_this.options.show_text; });

        this._init();
        return this;
    },

    /** Create the rendering
     */
    _init: function() {
        // init environment
        var _this = this,
            mouse = new THREE.Vector2(),
            camera, controls, scene, projector, renderer, stats;
        
        camera = new THREE.PerspectiveCamera( 40, this.width / this.height, 1, 10000 );
        camera.position.z = 1700;
        
        scene = new THREE.Scene();

        controls = new THREE.TrackballControls(camera, this.el);
        controls.rotateSpeed = 5;
        controls.zoomSpeed = 4;
        controls.panSpeed = 3;
        controls.noZoom = false;
        controls.noPan = false;
        controls.staticMoving = true;
        controls.dynamicDampingFactor = 0.3;

        // "init renderer"
        renderer = new THREE.CanvasRenderer( { antialias: true } );
        renderer.sortObjects = true;
        renderer.setClearColor(new THREE.Color(this.clear_color));
        renderer.setSize(this.width, this.height);
        $(renderer.domElement).css("background-color", new THREE.Color(this.clear_color).getStyle() );
        
        // save it as attributs
        this.camera = camera;
        this.controls = controls;
        this.scene = scene;
        this.renderer = renderer;
        this.projector = new THREE.Projector();

        // Bind events
        _.bindAll(this, 'animate', 'render', 'resize_rendering');
        _.bindAll(this, 'onMouseMove', 'onMouseUp', 'onMouseDown', 'onMouseOut', 'onDblClick');

        // estimate if window is visible with focus
        //TODO: it is now possible to do better : 
        // http://stackoverflow.com/questions/12536562/detect-whether-a-window-is-visible
        this.listenTo(Cello.utils.asEvents(window), 'focus', function(e){
            _this.WINDOWVISIBLE = true;
        });
        this.listenTo(Cello.utils.asEvents(window), 'blur', function(e){
            _this.WINDOWVISIBLE = false;
        });
        
        // model events
        this.listenTo(this.model, 'change', function(){ _this.request_animation(); } );
    
       
        // debug/exemple binding
        this.on('dblclick', function(e){ 
            console.log('gviz.ThreeViz', 'dblclick', e); });
        this.on('highlight', function(e){ 
            console.log('gviz.ThreeViz', 'highlight', e); });
        //@this.listenTo(this.model, 'change:selected', function(e){ console.log('gviz.ThreeViz', 'change:selected', e) });
       
        
        renderer.domElement.addEventListener('mousemove', this.onMouseMove, false);
        renderer.domElement.addEventListener('mousedown', this.onMouseDown, false);
        renderer.domElement.addEventListener('mouseout', this.onMouseOut, false);
        renderer.domElement.addEventListener('mouseup', this.onMouseUp, false);
        renderer.domElement.addEventListener('dblclick', this.onDblClick, false);
        var mousewheel = function(event){
            _this.request_animation(1000);
        }
        renderer.domElement.addEventListener('mousewheel', mousewheel, false );
        renderer.domElement.addEventListener('DOMMouseScroll', mousewheel, false );
        
        renderer.domElement.addEventListener( 'touchstart', function(e){ 
                    _this.MOUSEDOWN = true; 
                    this.request_animation();
                }, false );
        renderer.domElement.addEventListener( 'touchend', function(e){ _this.MOUSEDOWN = false }, false );

        // add event listener to resize the rendering if $el resize
        if(this._width < 0 || this._height < 0 ){
            //Note: the binding is done only if the height or width aren't setted
            // (elsewhere there is no use to resize)
            this.listenTo(Cello.utils.asEvents(window), 'resize', this.resize_rendering);
        }

        // add the rendering to the DOM
        this.$el.append(renderer.domElement);
        // note that init is done well
        this._inited = true;
    },

    /** Called when the window is resized
     */
    resize_rendering: function() {
        var width = this.width,
            height = this.height;
        console.log(height, width, this.camera)
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    },

    /** create visualisation model from Graph
        reset graph/clean scene first
        @return viz
    */
    set_graph: function(graph){
        if( !this._init || graph === null ){
            return this;
        }

        var _this = this;
        
        if (this.model){
            this.model.set('graph', graph);
        }
        this.listenTo(graph.vs, "change", _this.update);
        this.listenTo(graph.es, "change", _this.update);
        
        this.clean_scene();
        
        var wnidx= {}, wnodes = [], wedges = []
            
        // node drawing function factory 
        var program_factory = function(id) {
            var _id = id;
            return function(ctx){_this.render_node( _this, _id, ctx);  };
        };
        
        for ( var i=0;  i<graph.vs.length; i++ ) {
            var node = graph.vs.at(i);
            var coords = node.get('coords');
            
            var material = new THREE.SpriteCanvasMaterial({
                program: program_factory(i),
            });

            var wnode = new THREE.Sprite(material);
            wnode.position = new THREE.Vector3(-1,-1,-1);
            wnode.scale.x = wnode.scale.y = this.wnode_scale(node);
            wnode._type = "node";
            wnode._node = node;
            wnode._edges = [];
            
            wnidx[node.id] = i;

            this.setPosition(wnode.position, coords, 500, TWEEN.Easing.Elastic.OutIn);

            this.scene.add( wnode );
            wnodes.push( wnode );
        }

        for ( var i = graph.es.length-1; i>=0 ; i-- )
        {
            var edge = graph.es.at(i);
            
            // FIXME
            if ('linewidth' in edge.attributes === false ){
                edge.set('linewidth', 1, {silent:true});
            }

            var wsrc = wnodes[ wnidx[edge.source.id]], 
                wtgt = wnodes[ wnidx[edge.target.id]];

            var geometry = new THREE.Geometry();
            
            geometry.vertices.push(wsrc.position.clone());
            this.setPosition(geometry.vertices[0], edge.source.get('coords'), 500);
            
            geometry.vertices.push(wtgt.position.clone());
            this.setPosition(geometry.vertices[1], edge.target.get('coords'), 500);
            
            var material = new THREE.LineBasicMaterial({});
            
            var line = new THREE.Line( geometry, material );
            line._type = "edge";
            line._edge = edge;
            
            // store edges to nodes
            wsrc._edges.push(line);
            wtgt._edges.push(line);
            wedges.push(line);
            this.scene.add( line );
        }

        this.wnodes = wnodes;
        this.wedges = wedges;        
        this.graph = graph;
        
        this.update();
        
        return this;
    },
    
    /** set the position of an object with (ornot) an animation
     *
     * target: the object to move  (node or edge) could be also light or camera
     * coords: the new final coords
     * delay: transition time
     * easing: transition function (see TWEEN easing fct)
     * complete: callback function when completed see TWEEN.onComplete
    */
    setPosition: function(target, coords, delay, easing, complete){
    
        var complete = complete || null;
        var easing = easing || TWEEN.Easing.Circular.In;

        var position = {}
        if (_.isArray(coords)){
            position.x = coords[0] * 1000;
            position.y = coords[1] * 1000;
            position.z = coords[2] * 1000;
        }
        else
            position = coords
        
        if (delay){
            // delay and transition
            tween = new TWEEN.Tween(target)
              .to(position, delay)
              .easing(easing)
              .onComplete(complete)
              .start();
        }
        else {
            // update immediatly
            for (k in position)
                target[k] = position[k];
        }
    },
    
    collapse : function(delay, easing, complete){
        /**
         * tween back vertices and edges to 0
         **/ 
        
        // restore vertices & edges positions to 0
        if (this.scene.children.length > 0){
            
            delay =  delay | 0;
            
            var coords = {x:0, y:0, z:0};
            
            for ( i=0;  i<this.wnodes.length; i++ ) {
                var wnode = this.wnodes[i];
                this.setPosition(wnode.position, coords, delay, easing, complete );
            }
            
            for ( i=0;  i<this.wedges.length; i++ ) {
                var line = this.wedges[i];
                this.setPosition(line.geometry.vertices[0], coords, delay, easing, complete);
                this.setPosition(line.geometry.vertices[1], coords, delay, easing, complete);
            }

            this.request_animation();
            
        }
        
    },

    update: function(){

        var _this = this;
        
        // update_vertices positions
        _.each(this.wnodes, function(wnode){
            var coords = wnode._node.get('coords');
            _this.setPosition(wnode.position, coords, 500, TWEEN.Easing.Elastic.InOut);
        });
    
        // Update edges  material, color, opacity and linewidth
        // implements edge flags ( 'faded') 
        var _this = this;
        _.each(this.wedges, function(line){
            var edge = line._edge;
            
            // linewidth
            line.linewidth = edge.get('linewidth');
            
            // opacity: if one of the vertex is 'faded' opacity: 0.3
            if (edge.source.has_flag('faded') || edge.target.has_flag('faded'))
                line.material.opacity = 0.3;
            else
                line.material.opacity = 1.0;

            // colors
            var colors = [ 
                    gviz.ThreeVizHelpers.to_color( _.map(edge.source.get('color'), function(e) {return e/255})), 
                    gviz.ThreeVizHelpers.to_color( _.map(edge.target.get('color'), function(e) {return e/255}))
                ];  
                
            // use vertex colors flag ( comment for plain color )
            line.material.vertexColors = THREE.VertexColors;
            // vertex color
            line.geometry.colors = colors;
            // plain color (mean color from vertices)
            line.material.color = gviz.ThreeVizHelpers.meanColor(colors[0],colors[1]);

            // positions
            _this.setPosition(line.geometry.vertices[0], edge.source.get('coords'), 500);
            _this.setPosition(line.geometry.vertices[1], edge.target.get('coords'), 500);
        });
        
        this.request_animation();
    },

    /** Force continuous rendering for *duration* time :
     *   - stop current animate timeout
     *   - set this.ANIMATE to True
     *   - set a time out to switch this.ANIMATE to False in duration time
     *
     * if called without *duration* it just cancel the animate timeout and re-run it
     */
    request_animation: function(duration){
        // special handle with ff rendering pb during mouse wheel
        
        if (duration) {
            // set flag to force continous animation
            this.ANIMATE = true;
            // cancel current continous animation stop timeout, if any
            if(this._animate_timeout_id){
                clearTimeout(this._animate_timeout_id);
                this._animate_timeout_id = null;
            }
            // set a new continous annimation stop timeout
            var _this = this;
            this._animate_timeout_id = setTimeout(function(){
                _this.ANIMATE = false;
            }, duration);
        }

        // cancel animate timeout if any exists
        if (this._timeout_id){
            clearTimeout(this._timeout_id);
            this._timeout_id = null;
            // and restart a clear animation loop
            requestAnimationFrame(this.animate);
        }
    },

    /** main animaton loop */
    animate: function() {
        // render frame
        this.render();

        // determine if tween animation are curenty running
        var has_tweens = TWEEN.getAll().length > 0;
        
        // loop calls
        
        // render immediatly if ( mouse down, transition or animation in progress) 
        if( (this.ANIMATE || has_tweens || this.MOUSEDOWN) && this.WINDOWVISIBLE )
        {
            requestAnimationFrame(this.animate);
        } 
        else { // render one frame every 5 sec
            var _this = this;
            this._timeout_id = setTimeout(function(){
                requestAnimationFrame(_this.animate);
            }, 5000);
        }

        return this;
    },

    render: function() {
        // camera controls
        this.controls.update();
        
        // objects transitions
        TWEEN.update();

        // clear canvas
        var ctx = this.renderer.domElement.getContext('2d')
        ctx.fillStyle = new THREE.Color(this.clear_color).getStyle();
        ctx.fillRect(0,0, this.width, this.height);
        
        // render frame
        this.renderer.render( this.scene, this.camera );
        
        return this;
    },

    /** removes all nodes and edges from the scene
     * Actually all object that have '_type' property
     */
    clean_scene: function(){
        var children = this.scene.children;
        var scene = this.scene;
        var obj, i;
        
        for ( i = children.length - 1; i >= 0 ; i -- ) {
            obj = children[ i ];
            if ( _.has(obj,"_type")) {
                scene.remove(obj);
            }
        }
    },

    // ====  EVENTS  ====

    getMouseOnCanvas : function(event, rect){
        // FIXME broken with jquery 1.9+
        return { x: event.clientX - rect.left ,
                 y: event.clientY - rect.top};
        //@
        //@return { x: event.pageX - rect.left ,
                 //@y: event.pageY - rect.top     };

        //@if ($.browser.webkit){
            //@return { x: event.clientX - rect.left ,
                     //@y: event.clientY - rect.top     }
        //@}
        //@else { // if ($.browser.mozilla){
            //@return { x: event.clientX - rect.left - $('body').scrollLeft(),
                     //@y: event.clientY - rect.top - $('body').scrollTop()     }
        //@}
    },

    /** When the mouse move over the Canvas
     *
     * if mouse is NOT pressed then it check if a node is intersected 
     * and update the model in consequence
     */
    onMouseMove: function( event ) {
        event.preventDefault();
        this.MOUSEONCANVAS = true;
        this.MOUSEHASMOVED = true;
        
        // FIXME event callback
        var popup_event = function(){}; // empty function for compatibility
        
        if (this.MOUSEDOWN === false){
            var rect = this.el.getBoundingClientRect(), root = document.documentElement;
            // relative mouse position
            mouse_canvas = this.getMouseOnCanvas(event, rect);
            var mouse = {};
            mouse.x = (mouse_canvas.x / $('canvas', this.$el).width()) * 2 - 1;
            mouse.y = - ( mouse_canvas.y / $('canvas', this.$el).height() ) * 2 + 1;
            // find intersections
            var vector = new THREE.Vector3( mouse.x, mouse.y, 0 );
            this.projector.unprojectVector( vector, this.camera );
            var ray = new THREE.Raycaster( this.camera.position, vector.sub( this.camera.position ).normalize() );
            var intersects = ray.intersectObjects( this.scene.children );
            if ( intersects.length > 0 ) {
                if( "node" == intersects[ 0 ].object._type){
                    this.model.set_intersected(intersects[0].object._node.id);
                    popup_event(event.x, event.y, intersects[0].object._node);
                }
                else {
                    this.model.set_intersected(null);
                }
            }
            else {
                this.model.set_intersected(null);
                popup_event(event.x,event.y,null);
            }
        }
        else {
            popup_event(event.x, event.y, null);
        }
    },

    /** Just update the flags
     */
    onMouseDown: function( event ) {
        event.preventDefault();
        this.MOUSEDOWN = true;
        this.MOUSEHASMOVED = false;
        this.request_animation();
    },

    /** When mouse released, update the selected node
     */
    onMouseUp: function( event ) {
        event.preventDefault();
        var intersected = this.model.get('intersected');
        if ( event.ctrlKey ){ // multiple selection with ctrl key
            if ( intersected !== null ){
                this.model.add_selected( [intersected]);
            }
        } else if (this.MOUSEHASMOVED === false) {
            this.model.set_selected(intersected !== null ? [intersected] : []);
        }
        this.MOUSEDOWN = false;
    },

    /** When mouse go out of canvas, update the flags
     */
    onMouseOut: function( event ) {
        event.preventDefault();
        this.MOUSEONCANVAS = false;
        this.MOUSEDOWN = false;
    },

    /** When dbl click on the canvas, raise "dblclick" event with intersected node (if any)
     */
    onDblClick: function( event ){
        var intersected = null;
        if(this.model.get('intersected')){
            intersected = this.graph.vs.get(this.model.get('intersected'));
        }
        this.trigger("dblclick" , intersected);
    },

}); // ThreeViz



/* TODO
 *
 */

gviz.ThreeVizHelpers = {
    PI2: Math.PI * 2,

    SPLIT_LABEL_RE: /^(.{4,15}) /m,

    POLICE : 'normal 12px sans ',
    // FIXME as a template
    HTML : [
         "<div class='layer_dbg' style='position:absolute' ></div>",
         "<div class='layer_conf' ></div>",
         "<div class='layer_conf_panel' style='display:none'>",
         "<H2>TIPS</H2>",
         "<p>* use ctrl ke to select several nodes</p> ",
         "<H2>Visualisation Options</H2>",
         "<label><input class='l' type='checkbox' id='vz_opt_show_nodes' value='1' checked>Show nodes</label>",
         "<label><input class='l' type='checkbox' id='vz_opt_show_edges' value='1' checked>Show edges</label>",
         "<label><input class='l' type='checkbox' id='vz_opt_show_text' value='1' checked>Show text</label>",
         " ",
         "<H2>Debug Options</H2>",
         "<label><input class='l' type='checkbox' id='vz_inp_debug_mouse' value='1' >Debug mouse</label><br/>",
         "<label><input class='l' type='checkbox' id='vz_inp_debug_node' value='1' >Debug node</label>",
         "</div>"].join('\n'),
    
    to_color: function(color){
        if (_.isArray(color))
            return new THREE.Color( color[0],color[1],color[2]);
    },
    
    meanColor : function(/* *THREE.Color */){
    /** computes the meancolor of given *THREE.Color  */
        var r,g,b;
        r = g = b =0;
        mean = new THREE.Color();
        for (var i in arguments){
            var color = arguments[i]
            r += color.r;
            g += color.g;
            b += color.b;
        }
        mean.r = r / arguments.length;
        mean.g = g / arguments.length;
        mean.b = b / arguments.length;
        return mean;
    },

    wnode_scale : function(node){
        return 1;
    },

    render_node : function( viz, pid, context ) {
    /* Sample default rendering method */
    // optimizations
    //  http://blogs.msdn.com/b/eternalcoding/archive/2012/03/23/lib-233-rez-la-puissance-du-canvas-de-html5-pour-vos-jeux-partie-1.aspx
        // requires rgbToHsv   hsvToRgb
        var hsvToRgb = Cello.utils.hsvToRgb,
            rgbToHsv = Cello.utils.rgbToHsv;
            
        var wnode = viz.wnodes[pid],
            node = viz.graph.vs.at(pid),
            nid = node.id,
            rgbt3 = node.get('color'),
            csscolor = "rgb(" + rgbt3.join(',') + ")" ;

        // Node properties
        var intersected = viz.model.get('intersected') == nid;
        var selected = viz.model.is_selected(nid);
        var faded = node.has_flag('faded');
        
        // Drawing Node
        if (viz.model.get('show_nodes')){
            
            //fill particule
            var hsv = rgbToHsv(rgbt3[0], rgbt3[1], rgbt3[2]),
                rgb = hsvToRgb(hsv[0], hsv[1], 60),
                hexrgb = "rgb(" + rgb.join(',') + ")";

            // inner sprite linear gradient
            var grd = context.createLinearGradient(-0.5, -0.5,0.5, 0.5);
            grd.addColorStop(0, hexrgb);
            grd.addColorStop(1, csscolor);
                            
            if (faded){
               context.globalAlpha = 0.3;
            }
            else
               context.globalAlpha = 1.0;
            
            context.beginPath();
            context.arc(0, 0, 1, 0, gviz.ThreeVizHelpers.PI2, true);
            context.closePath();
            context.fillStyle = grd;
            context.fill();
            
            // shape
            if ( selected ){ 
                context.lineWidth = 0.1;
                context.strokeStyle = "#EEE";
                context.stroke();
            }
            else if (intersected ){ 
                context.lineWidth = 0.1;
                context.strokeStyle = "#AAA";
                context.stroke();
            }
            else{                    
                context.lineWidth = 0.05;
                context.strokeStyle = csscolor;
                context.stroke();
            }
        } // show_nodes

        /* Drawing Text */
        if ((viz.model.get('show_text') && (!viz.MOUSEHASMOVED|| !viz.MOUSEDOWN )) | 
                ( !viz.MOUSEDOWN && intersected ) ){
            // split to print label in multi lines
            //var text = node.label().trim().split(' ');
            var oneline_text = node.label().trim();
            var debut, text = [];
            split_all = false;
            while(!split_all){
                debut = gviz.ThreeVizHelpers.SPLIT_LABEL_RE.exec(oneline_text);
                if(debut){
                    text.push(debut[1]);
                    oneline_text = oneline_text.substring(debut[1].length, oneline_text.length);
                } else {
                    split_all = true;
                    text.push(oneline_text);
                }
            }

            // size
            if ( intersected || selected ){
                context.scale(viz.text_scale*1.5, -viz.text_scale*1.5);
            } else {
                context.scale(viz.text_scale, -viz.text_scale);
            }

            // style
            //context.strokeStyle = '#333';
            //context.fillStyle = csscolor;
            context.fillStyle = "#333";
            
            context.font = gviz.ThreeVizHelpers.POLICE;
            /*if ( node_selected ){
                context.strokeStyle = "#111";
            }*/

            // position
            for (var i in text){
                var y = 3 + ((text.length-1) * -12)/text.length + 11 * (i) ;
    //            context.fillStyle = "#FFF";
    //            context.fillRect( -12, 4, 50, -10)
                var text_width = context.measureText(text[i]).width;
                //context.lineWidth = ;
                context.fillText(text[i] , text_width / -2, y);
                //context.lineWidth = .8;
                //context.strokeText(text[i] , text_width / -2, y);
            }
            context.restore();
        } //show_text

        //~ if ((viz.model.get('show_text') && !viz.MOUSEDOWN) |
              //~ ( !viz.MOUSEDOWN && intersected == nid ) el   ){
    },
    
    create_label_texture: function(text){
        var canvas = document.createElement('canvas');
        // $('body').append(canvas); 
        var context = canvas.getContext('2d');
        //~ context.scale(viz.text_scale, -1 * viz.text_scale);
        //context.scale(0.2, -0.2);
        canvas.height = 18;
        canvas.width = 20;
        context.font =  'sans 18px sans' ; //gviz.ThreeVizHelpers.POLICE ;
        context.textAlign = "center";
        context.textBaseline = "alphabetic";
        var text_width = context.measureText(text).width;        
        canvas.height = 18;
        canvas.width = text_width;
        context.fillStyle = "#6C9F6D";
        context.fillRect(0, 0, text_width , 18);
        context.fillStyle = "#121";
        context.font =  'italic 18px sans' ; //gviz.ThreeVizHelpers.POLICE ;
        context.fillText(text , 0, 14);

        return canvas;
    },

    edges_colors_on_node_selected : function(viz){
        /**
         * Basic behavior helper
         * * put back edges thickness
         * * show bigger edges in view from selected node
         * @param viz : viz object
         * @param selected_nodes: []
         * @param last_nodes: []
         */
        var selected_nodes = viz.model.selected;
        var last_nodes = viz.model.last_selected;
        var i, j, len, line, wnode;
        // set edges back
        if (last_nodes){ // put back node material
            for ( i = last_nodes.length-1; i > -1; i-- ){
                wnode = viz.wnodes[ last_nodes[i] ];
                for (len= wnode._edges.length, j=0; j != len; j++){
                    line = wnode._edges[j];
                    line.material.linewidth = line._edge.get('linewidth')  
                    line.material.color = new THREE.Color(viz.edges_color);
                }
            }
        }
        if ( selected_nodes ){
            for ( i = selected_nodes.length-1 ; i > -1; i-- ){
                wnode = viz.wnodes[ selected_nodes[i] ];
                for (len= wnode._edges.length, j=0; j != len; j++){
                    line = wnode._edges[j];
                    line.material.linewidth = 3;
                    //line.material.color = new THREE.Color().setRGB(0.1,0.1,0.1); // 0 to 1
                }
            }
        }
    },
}; //gviz.ThreeVizHelpers
Cello.gviz = gviz


    return Cello;
}))
