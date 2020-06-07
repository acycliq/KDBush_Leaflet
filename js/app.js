/* global PIXI, L, BezierEasing, KDBush */
'use strict';
$(document).ready(function () {

    var map = L.map('map', {
        preferCanvas: true,
        maxZoom: 18,
        minZoom: 3
    }).setView([0, 0], 8);

    var url = 'data/geojson.json';
    var points;
    var index;
    var myHighlight;
    var lastVisited;
    var targetScale;

    $.ajax({
        dataType: 'json',
        crossdomain: true,
        url: url,
        success: function (response) {
            L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
                attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
                maxZoom: 18,
                minZoom: 3,
                id: 'mapbox/streets-v11',
                tileSize: 512,
                zoomOffset: -1,
                accessToken: 'pk.eyJ1IjoibWlya29tZW43NyIsImEiOiJjajA2cTdzeXEwMDJnMzNsa290MG11cmI5In0.P5frBq0Ayn3ce2WZP21gHw'
            }).addTo(map);

            var markers = [
                {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [0, 0]
                    },
                    id: 'Zero'
                },
                {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [0.1281, 51.5080]
                    },
                    id: 'London'

                }
            ]

            // var markers = response.data.geojson.features;
            points = markers.map(function (marker) {
                return {
                    x: parseFloat(marker.geometry.coordinates[1]),
                    y: parseFloat(marker.geometry.coordinates[0]),
                    id: marker.id
                };
            });

            index = new KDBush(points, function (p) {
                return p.x;
            }, function (p) {
                return p.y;
            }, 64, Float64Array);


            useWebGL(markers);
        },
        error: function (error) {
            console.log(JSON.parse(error.responseText));
        }
    });

    function useWebGL(markers) {

        var markerSprites = [];
        var bounds = [];

        var loader = new PIXI.loaders.Loader();
        loader.add('marker', 'img/marker.png');
        loader.load(function (loader, resources) {
            var texture = resources.marker.texture;

            var pixiLayer = (function () {
                var zoomChangeTs = null;
                var pixiContainer = new PIXI.Container();
                var innerContainer = new PIXI.particles.ParticleContainer(markers.length, {vertices: true});
                // add properties for our patched particleRenderer:
                innerContainer.texture = texture;
                innerContainer.baseTexture = texture.baseTexture;
                innerContainer.anchor = {x: 0.5, y: 0.5};

                pixiContainer.addChild(innerContainer);

                var doubleBuffering = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                var initialScale;
                return L.pixiOverlay(function (utils, event) {
                    var zoom = utils.getMap().getZoom();
                    var container = utils.getContainer();
                    var renderer = utils.getRenderer();
                    var project = utils.latLngToLayerPoint;
                    var getScale = utils.getScale;
                    var invScale = 1 / (getScale() * 2);

                    if (event.type === 'add') {
                        var origin = project([(48.7 + 49) / 2, (2.2 + 2.8) / 2]);
                        innerContainer.x = origin.x;
                        innerContainer.y = origin.y;
                        initialScale = invScale;
                        innerContainer.localScale = 30;
                        for (var i = 0; i < markers.length; i++) {
                            var coords = project([markers[i].geometry.coordinates[1], markers[i].geometry.coordinates[0]]);
                            // our patched particleContainer accepts simple {x: ..., y: ...} objects as children:
                            innerContainer.addChild({
                                x: coords.x - origin.x,
                                y: coords.y - origin.y
                            });

                            bounds.push([markers[i].geometry.coordinates[1], markers[i].geometry.coordinates[0]]);
                        }
                    }

                    if (event.type === 'zoomanim') {
                        var targetZoom = event.zoom;
                        //   if (targetZoom >= 16 || zoom >= 16) {
                        zoomChangeTs = 0;
                        targetScale = targetZoom >= 1 ? 1 / (getScale(event.zoom) * 2) : initialScale;
                        console.log('target scale is: ' + targetScale)
                        innerContainer.currentScale = innerContainer.localScale;
                        innerContainer.targetScale = targetScale;
                        //       }
                        return;
                    }

                    if (event.type === 'redraw') {
                        var delta = event.delta;
                        if (zoomChangeTs !== null) {
                            var duration = 17;
                            zoomChangeTs += delta;
                            var lambda = zoomChangeTs / duration;
                            if (lambda > 1) {
                                lambda = 1;
                                zoomChangeTs = null;
                            }
                            //   lambda = easing(lambda);
                            innerContainer.localScale = innerContainer.currentScale + lambda * (innerContainer.targetScale - innerContainer.currentScale);
                        } else {
                            return;
                        }
                    }

                    map.on('mousemove', L.Util.throttle(function (e) {
                        onMousemove(e);
                    }, 32));

                    function onMousemove(e) {
                        var mouseTarget = findFeature(e.latlng);
                    }

                    function findFeature(latlng) {
                        // console.log('zoom is: ' + zoom);
                        // console.log('scale is: ' + getScale(zoom));
                        var out = [];
                        var results = index.within(latlng.lat, latlng.lng, 5).map(id => points[id]);
                        if (results.length) {
                            console.log('Found ' + results.length + 'points');
                            console.log('results are: '+ results);
                            results.forEach(d => {
                                var mouseCursor = turf.point([latlng.lng, latlng.lat]);
                                var toPoint = turf.point([results[0].y, results[0].x]);

                                var dist = turf.distance(mouseCursor, toPoint);
                                var pxDist = calcDist(mouseCursor, toPoint);
                                console.log('Distance is: ' + dist);
                                console.log('pixel distance is: ' + calcDist(mouseCursor, toPoint));
                                if (pxDist < 24/Math.sqrt(2) ) { // <=== That a wild guess! Not sure if it is the general rule (probably not).
                                    // Your png marker is 48x48 hence the 24. For the square root I dont have an explanation, it was more by gut feeling.
                                    // It looks ok-ish here but probably it is by some coincidence that it works.
                                    highlightPoint(toPoint)
                                } else {
                                    removeHighlight()
                                }
                            });
                        }
                        return out;
                    }

                    function calcDist(a, b){
                        var p1 = map.latLngToContainerPoint([a.geometry.coordinates[1], a.geometry.coordinates[0]]) ;
                        var p2 = map.latLngToContainerPoint([b.geometry.coordinates[1], b.geometry.coordinates[0]]) ;

                        var dx = p1.x - p2.x,
                            dy = p1.y - p2.y;
                        return Math.sqrt(dx**2 + dy**2 )
                    }

                    function removeHighlight() {
                        if (map.hasLayer(myHighlight)) {
                            map.removeLayer(myHighlight)
                            console.log('Highlight removed')
                        }
                        lastVisited = null;
                    }

                    function highlightPoint(p) {
                        if (lastVisited && turf.booleanEqual(p, lastVisited)) {
                            console.log('do nothing')
                        } else {
                            myHighlight = L.geoJSON(p, {
                                pointToLayer: function (feature, latlng) {
                                    return L.circleMarker(latlng, highlightStyle(feature));
                                },
                                interactive: false,
                            });
                            myHighlight.addTo(map);
                            lastVisited = p
                        }
                    }

                    function highlightStyle(feature) {
                        return {
                            // fillColor: "#FFCE00",
                            color: "#FFCE00",
                            // weight: 1,
                            // opacity: 1,
                            // fillOpacity: 0.5
                        };
                    }

                    function getColor(feature){

                    }

                    renderer.render(container);
                }, pixiContainer, {
                    doubleBuffering: doubleBuffering,
                    destroyInteractionManager: true
                });
            })();

            pixiLayer.addTo(map);
            window.setTimeout(function () {
                map.fitBounds(bounds);
            }, 500);

            var ticker = new PIXI.ticker.Ticker();
            ticker.add(function (delta) {
                pixiLayer.redraw({type: 'redraw', delta: delta});
            });
            map.on('zoomstart', function () {
                ticker.start();
            });
            map.on('zoomend', function () {
                ticker.stop();
            });
            map.on('zoomanim', pixiLayer.redraw, pixiLayer);

            // function findMarker(ll) {
            //
            //     var results = index.within(ll.lat, ll.lng, 1).map(function (id) {
            //         return points[id];
            //     });
            //
            //     console.log(results);
            //     alert('Found ' + results.length + ' markers');
            // }
            //
            // map.on('click', function (e) {
            //     findMarker(e.latlng);
            // });


        });
    }
});
