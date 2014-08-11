// Filename: main.js

// Require.js allows us to configure shortcut alias
// There usage will become more apparent further along in the tutorial.
require.config({
  paths: {
    underscore: 'lib/underscore-min',
    jquery: 'lib/jquery-1.11.0.min',

    backbone: 'lib/backbone-min',
    backbone_forms: 'lib/backbone-forms.min',

    bootstrap: 'lib/bootstrap/js/bootstrap.min',

    threejs: 'lib/three.min',
    threejs_trackball: 'lib/three-TrackballControls',
    threejs_renderer: 'lib/three-HackedCanvasRenderer',

    tween: 'lib/Tween',

    autocomplete: 'lib/backbone.autocomplete',

    moment:  'lib/moment.min',

    cello_core: 'build/cello-lib',
    cello_ui: 'build/cello-ui',
    cello_gviz: 'build/cello-gviz',
    cello_templates: 'jstmpl',
  },
  shim: {
      // bootstrap need jquery
      'bootstrap': {deps: ["jquery"]},
      // threejs not require compatible...
      'threejs': {
            exports: 'THREE',
            init: function(THREE){
                    require([ 'threejs_trackball', 'threejs_renderer'])
                }
        }
    }
});


require([
        "global"
    ], function(global){
        console.log(global);
        require([
            // Load our app module and pass it to our definition function
            global.app,
        ], function(App){
            // The "app" dependency is passed in as "App"
            console.log(App)
            new App().start();
        });
});