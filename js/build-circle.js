
(function() {
    var loader = new PIXI.loaders.Loader();
    loader
        .add('marker', 'img/marker-icon.png');

    loader.load(function(loader, resources) {
        var markerTexture = resources.marker.texture;
        var map = L.map('map').setView([51.505, -0.09], 14);
        L.tileLayer('//stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.png', {
            subdomains: 'abcd',
            attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.',
            minZoom: 2,
            maxZoom: 18
        }).addTo(map);
        map.attributionControl.setPosition('bottomleft');
        map.zoomControl.setPosition('bottomright');
        var pixiOverlay = (function() {
            var frame = null;
            var firstDraw = true;
            var prevZoom;

            var markerLatLng = [51.5, -0.09];
            var marker = new PIXI.Sprite(markerTexture);
            marker.popup = L.popup({className: 'pixi-popup'})
                .setLatLng(markerLatLng)
                .setContent('<b>Hello world!</b><br>I am a popup.')
                .openOn(map);

            var polygonLatLngs = [
                [51.509, -0.08],
                [51.503, -0.06],
                [51.51, -0.047],
                [51.509, -0.08]
            ];
            var projectedPolygon;

            var circleCenter = [51.508, -0.11];
            var projectedCenter;
            var circleRadius = 85;

            var triangle = new PIXI.Graphics();
            triangle.popup = L.popup()
                .setLatLng([51.5095, -0.063])
                .setContent('I am a polygon.');
            var circle = new PIXI.Graphics();
            circle.popup = L.popup()
                .setLatLng(circleCenter)
                .setContent('I am a circle.');

            [marker, triangle, circle].forEach(function(geo) {
                geo.interactive = true;
            });

            var pixiContainer = new PIXI.Container();
            pixiContainer.addChild(marker, triangle, circle);
            pixiContainer.interactive = true;
            pixiContainer.buttonMode = true;

            var doubleBuffering = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

            return L.pixiOverlay(function(utils) {
                if (frame) {
                    cancelAnimationFrame(frame);
                    frame = null;
                }
                var zoom = utils.getMap().getZoom();
                var container = utils.getContainer();
                var renderer = utils.getRenderer();
                var project = utils.latLngToLayerPoint;
                var scale = utils.getScale();

                if (firstDraw) {
                    var getRenderer = utils.getRenderer;
                    utils.getMap().on('click', function(e) {
                        // not really nice but much better than before
                        // good starting point for improvements
                        var interaction = utils.getRenderer().plugins.interaction;
                        var pointerEvent = e.originalEvent;
                        var pixiPoint = new PIXI.Point();
                        // get global click position in pixiPoint:
                        interaction.mapPositionToPoint(pixiPoint, pointerEvent.clientX, pointerEvent.clientY);
                        // get what is below the click if any:
                        var target = interaction.hitTest(pixiPoint, container);
                        if (target && target.popup) {
                            target.popup.openOn(map);
                        }
                    });
                    var markerCoords = project(markerLatLng);
                    marker.x = markerCoords.x;
                    marker.y = markerCoords.y;
                    marker.anchor.set(0.5, 1);
                    marker.scale.set(1 / scale);
                    marker.currentScale = 1 / scale;

                    projectedPolygon = polygonLatLngs.map(function(coords) {return project(coords);});

                    projectedCenter = project(circleCenter);
                    circleRadius = circleRadius / scale;
                }
                if (firstDraw || prevZoom !== zoom) {
                    marker.currentScale = marker.scale.x;
                    marker.targetScale = 1 / scale;

                    triangle.clear();
                    triangle.lineStyle(3 / scale, 0x3388ff, 1);
                    triangle.beginFill(0x3388ff, 0.2);
                    triangle.x = projectedPolygon[0].x;
                    triangle.y = projectedPolygon[0].y;
                    projectedPolygon.forEach(function(coords, index) {
                        if (index == 0) triangle.moveTo(0, 0);
                        else triangle.lineTo(coords.x - triangle.x, coords.y - triangle.y);
                    });
                    triangle.endFill();

                    circle.clear();
                    circle.lineStyle(3 / scale, 0xff0000, 1);
                    circle.beginFill(0xff0033, 0.5);
                    circle.x = projectedCenter.x;
                    circle.y = projectedCenter.y;
                    circle.drawCircle(0, 0, circleRadius);
                    circle.endFill();
                }

                var duration = 100;
                var start;
                function animate(timestamp) {
                    var progress;
                    if (start === null) start = timestamp;
                    progress = timestamp - start;
                    var lambda = progress / duration;
                    if (lambda > 1) lambda = 1;
                    lambda = lambda * (0.4 + lambda * (2.2 + lambda * -1.6));
                    marker.scale.set(marker.currentScale + lambda * (marker.targetScale - marker.currentScale));
                    renderer.render(container);
                    if (progress < duration) {
                        frame = requestAnimationFrame(animate);
                    }
                }

                if (!firstDraw && prevZoom !== zoom) {
                    start = null;
                    frame = requestAnimationFrame(animate);
                }

                firstDraw = false;
                prevZoom = zoom;
                renderer.render(container);
            }, pixiContainer, {
                doubleBuffering: doubleBuffering,
                autoPreventDefault: false
            });
        })();
        pixiOverlay.addTo(map);
    });
})();
