/**
 * Plugin Name: FanFilm 4K
 * Description: Онлайн-просмотр 4K UHD фильмов и сериалов с зеркал FanFilm4K для Lampa
 * Version: 1.1.1
 */

(function () {
    'use strict';

    if (window.plugin_fanfilm4k_ready) return;
    window.plugin_fanfilm4k_ready = true;

    // Гарантируем отправку Referer с http://lampa.mx на https:// плеера
    try {
        var metaRef = document.querySelector('meta[name="referrer"]');
        if (!metaRef) {
            metaRef = document.createElement('meta');
            metaRef.name = 'referrer';
            document.head.appendChild(metaRef);
        }
        metaRef.content = 'unsafe-url';
    } catch (e) {}

    try {
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = [
            'body.fanfilm4k-fullscreen-active .app__content,',
            'body.fanfilm4k-fullscreen-active .activity,',
            'body.fanfilm4k-fullscreen-active .full-start,',
            'body.fanfilm4k-fullscreen-active .full-start-new,',
            'body.fanfilm4k-fullscreen-active .full-start-new__buttons,',
            'body.fanfilm4k-fullscreen-active .full-start__buttons,',
            'body.fanfilm4k-fullscreen-active .button--trailer,',
            'body.fanfilm4k-fullscreen-active .view--trailer,',
            'body.fanfilm4k-fullscreen-active .layer--modal,',
            'body.fanfilm4k-fullscreen-active .layer--content {',
            '    display: none !important;',
            '    visibility: hidden !important;',
            '    opacity: 0 !important;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    } catch (e) {}

    // Прямое рабочее зеркало по умолчанию
    var DEFAULT_MIRROR = 'https://v17.fanfilm4k.media';
    var ZERKALO_PORTAL = 'https://fanfilmzerkalo.fun/';

    // CORS-прокси по умолчанию для Smart TV (Media Station X)
    var DEFAULT_CORS_PROXY = 'https://lampasams.phonkartur.workers.dev/';

    var STORAGE_MIRROR_KEY = 'fanfilm4k_active_mirror';
    var STORAGE_CUSTOM_KEY = 'fanfilm4k_custom_mirror';
    var STORAGE_PROXY_URL_KEY = 'fanfilm4k_cors_proxy';

    function getStorage(key, def) {
        if (typeof Lampa !== 'undefined' && Lampa.Storage) {
            return Lampa.Storage.get(key, def);
        }
        try {
            var val = localStorage.getItem(key);
            return val !== null ? JSON.parse(val) : def;
        } catch (e) {
            return def;
        }
    }

    function setStorage(key, val) {
        if (typeof Lampa !== 'undefined' && Lampa.Storage) {
            Lampa.Storage.set(key, val);
            return;
        }
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) {}
    }

    function request(url, options, onSuccess, onError) {
        options = options || {};
        var method = options.method || 'GET';
        var data = options.data || null;
        var headers = options.headers || {};
        var timeout = options.timeout || 12000;

        var customProxy = (getStorage(STORAGE_PROXY_URL_KEY, '') || DEFAULT_CORS_PROXY || '').trim();
        var finalUrl = url;
        if (customProxy) {
            finalUrl = customProxy.replace(/\/+$/, '') + '/' + url;
        }

        if (typeof Lampa !== 'undefined' && Lampa.Reguest) {
            var network = new Lampa.Reguest();
            network.silent(finalUrl, function (response) {
                onSuccess(response);
            }, function (err) {
                var msg = 'Ошибка сети';
                if (err) {
                    if (err.status) msg += ' (' + err.status + ')';
                    else if (err.statusText) msg += ' (' + err.statusText + ')';
                    else if (err.message) msg += ' (' + err.message + ')';
                }
                if (onError) onError(new Error(msg));
            }, data, {
                headers: headers,
                dataType: options.dataType || 'text',
                timeout: timeout
            });
            return;
        }

        var xhr = new XMLHttpRequest();
        xhr.open(method, finalUrl, true);
        xhr.timeout = timeout;

        for (var h in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, h)) {
                xhr.setRequestHeader(h, headers[h]);
            }
        }

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 400) {
                onSuccess(xhr.responseText);
            } else {
                if (onError) onError(new Error('HTTP status ' + xhr.status));
            }
        };

        xhr.onerror = function () {
            if (onError) onError(new Error('CORS / Сетевая ошибка (status 0)'));
        };

        xhr.ontimeout = function () {
            if (onError) onError(new Error('Превышен таймаут ответа'));
        };

        if (data && typeof data === 'object' && !(data instanceof FormData)) {
            var query = [];
            for (var k in data) {
                if (Object.prototype.hasOwnProperty.call(data, k)) {
                    query.push(encodeURIComponent(k) + '=' + encodeURIComponent(data[k]));
                }
            }
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.send(query.join('&'));
        } else {
            xhr.send(data);
        }
    }

    var MirrorManager = {
        activeMirror: DEFAULT_MIRROR,

        getMirror: function (callback) {
            var custom = (getStorage(STORAGE_CUSTOM_KEY, '') || '').trim();
            if (custom) {
                callback(custom.replace(/\/+$/, ''));
                return;
            }

            var cached = (getStorage(STORAGE_MIRROR_KEY, '') || '').trim();
            if (cached) {
                callback(cached.replace(/\/+$/, ''));
                return;
            }

            callback(DEFAULT_MIRROR);
        },

        resolveFromPortal: function (callback) {
            request(ZERKALO_PORTAL, { timeout: 6000 }, function (html) {
                var found = null;
                var m1 = html.match(/href=["'](https?:\/\/[a-zA-Z0-9_\.-]*fanfilm[a-zA-Z0-9_\.-]*\/?[^"']*)["']/i);
                var m2 = html.match(/<link[^>]+rel=["']preconnect["'][^>]+href=["'](https?:\/\/[^"']+)["']/i);
                var m3 = html.match(/window\.location\.href=['"](https?:\/\/[^'"]+)['"]/i);

                if (m1 && m1[1]) found = m1[1];
                else if (m2 && m2[1]) found = m2[1];
                else if (m3 && m3[1]) found = m3[1];

                if (found) {
                    found = found.replace(/\/+$/, '');
                    MirrorManager.activeMirror = found;
                    setStorage(STORAGE_MIRROR_KEY, found);
                    callback(found);
                } else {
                    MirrorManager.activeMirror = DEFAULT_MIRROR;
                    callback(DEFAULT_MIRROR);
                }
            }, function () {
                var fallback = getStorage(STORAGE_MIRROR_KEY, DEFAULT_MIRROR);
                MirrorManager.activeMirror = fallback;
                callback(fallback);
            });
        },

        forceRefresh: function (callback) {
            this.activeMirror = null;
            this.resolveFromPortal(function (resolved) {
                if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                    Lampa.Noty.show('FanFilm4K: Актуальное зеркало: ' + resolved);
                }
                if (callback) callback(resolved);
            });
        }
    };

    var FanFilmSource = {
        search: function (card, onResult, onError) {
            MirrorManager.getMirror(function (mirror) {
                var title = (card.title || card.name || '').trim();
                var origTitle = (card.original_title || card.original_name || '').trim();
                var year = parseInt((card.release_date || card.first_air_date || '0000').substring(0, 4), 10);

                function doSearch(query, onDone, onFail) {
                    var searchUrl = mirror + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query);
                    request(searchUrl, {
                        method: 'GET',
                        dataType: 'text',
                        timeout: 10000
                    }, function (html) {
                        var regex = /<a[^>]+href=["'](https?:\/\/[^"']+\/([0-9]+-[^"']+\.html))["'][^>]*>([\s\S]*?)<\/a>/gi;
                        var m;
                        var items = [];
                        var seen = {};

                        while ((m = regex.exec(html)) !== null) {
                            var link = m[1];
                            if (seen[link]) continue;
                            seen[link] = true;

                            var text = m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                            items.push({
                                url: link,
                                text: text
                            });
                        }

                        if (items.length > 0) {
                            onDone(items);
                        } else {
                            onFail(null);
                        }
                    }, function (err) {
                        onFail(err);
                    });
                }

                doSearch(title, function (items) {
                    FanFilmSource.pickBestMatch(items, title, origTitle, year, onResult, mirror);
                }, function (err) {
                    if (err) {
                        var isBrowser = typeof window !== 'undefined' && window.location && window.location.hostname && !window.location.hostname.includes('localhost');
                        var hint = isBrowser ? ' (В браузере включите CORS Unblock / на Smart TV работает напрямую)' : '';
                        onError('Сетевая ошибка: ' + err.message + hint);
                        return;
                    }

                    if (origTitle && origTitle.toLowerCase() !== title.toLowerCase()) {
                        doSearch(origTitle, function (items) {
                            FanFilmSource.pickBestMatch(items, title, origTitle, year, onResult, mirror);
                        }, function (err2) {
                            if (err2) {
                                onError('Сетевая ошибка: ' + err2.message);
                            } else {
                                onError('Контент не найден на FanFilm4K по запросу: ' + title);
                            }
                        });
                    } else {
                        var cleanTitle = title.replace(/[:\-–—].*$/, '').trim();
                        if (cleanTitle && cleanTitle.length >= 3 && cleanTitle.toLowerCase() !== title.toLowerCase()) {
                            doSearch(cleanTitle, function (items) {
                                FanFilmSource.pickBestMatch(items, title, origTitle, year, onResult, mirror);
                            }, function () {
                                onError('Контент не найден на FanFilm4K по запросу: ' + title);
                            });
                        } else {
                            onError('Контент не найден на FanFilm4K по запросу: ' + title);
                        }
                    }
                });
            });
        },

        pickBestMatch: function (items, title, origTitle, year, onResult, mirror) {
            var best = items[0];
            if (year > 1900) {
                for (var i = 0; i < items.length; i++) {
                    if (items[i].text.includes(String(year)) || items[i].url.includes(String(year))) {
                        best = items[i];
                        break;
                    }
                }
            }

            FanFilmSource.loadMoviePage(best.url, mirror, onResult);
        },

        loadMoviePage: function (movieUrl, mirror, onResult) {
            request(movieUrl, {
                dataType: 'text',
                headers: {
                    'Referer': mirror + '/'
                }
            }, function (html) {
                var iframeMatch = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']*(?:stravers|transfusion|player|cdn)[^"']*)["']/i);
                if (!iframeMatch) {
                    onResult({ error: 'Плеер не найден на странице фильма' });
                    return;
                }

                var iframeUrl = iframeMatch[1];
                FanFilmSource.loadIframeData(iframeUrl, movieUrl, onResult);
            }, function (err) {
                onResult({ error: 'Ошибка загрузки страницы фильма: ' + err.message });
            });
        },

        loadIframeData: function (iframeUrl, referer, onResult) {
            request(iframeUrl, {
                dataType: 'text',
                headers: {
                    'Referer': referer
                }
            }, function (html) {
                var needle = 'fileList = JSON.parse(\'';
                var idx = html.indexOf(needle);
                if (idx === -1) {
                    onResult({
                        iframeUrl: iframeUrl,
                        directOnly: true
                    });
                    return;
                }

                var start = idx + needle.length;
                var end = html.indexOf('\');', start);
                if (end === -1) {
                    onResult({
                        iframeUrl: iframeUrl,
                        directOnly: true
                    });
                    return;
                }

                try {
                    var rawJson = html.slice(start, end);
                    var fileList = JSON.parse(rawJson);
                    onResult({
                        fileList: fileList,
                        iframeUrl: iframeUrl,
                        referer: referer
                    });
                } catch (e) {
                    console.error('[FanFilm4K] JSON parse error in fileList:', e);
                    onResult({
                        iframeUrl: iframeUrl,
                        directOnly: true
                    });
                }
            }, function () {
                console.log('[FanFilm4K] Iframe XHR failed, launching player directly');
                onResult({
                    iframeUrl: iframeUrl,
                    directOnly: true
                });
            });
        }
    };

    var FanFilmUI = {
        open: function (card) {
            if (typeof Lampa !== 'undefined' && Lampa.Loading) {
                Lampa.Loading.start(function () {
                    Lampa.Loading.stop();
                });
            }

            FanFilmSource.search(card, function (res) {
                if (typeof Lampa !== 'undefined' && Lampa.Loading) {
                    Lampa.Loading.stop();
                }

                if (res.error) {
                    if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                        Lampa.Noty.show('FanFilm4K: ' + res.error);
                    }
                    return;
                }

                if (res.directOnly || !res.fileList) {
                    FanFilmUI.launchPlayer(card, res.iframeUrl, null, null, null, res);
                    return;
                }

                var fileList = res.fileList;
                if (fileList.type === 'movie') {
                    FanFilmUI.showMovieTranslations(card, fileList, res);
                } else if (fileList.type === 'serial') {
                    FanFilmUI.showSerialSeasons(card, fileList, res);
                } else {
                    FanFilmUI.launchPlayer(card, res.iframeUrl, null, null, fileList, res);
                }
            }, function (errMsg) {
                if (typeof Lampa !== 'undefined' && Lampa.Loading) {
                    Lampa.Loading.stop();
                }
                if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                    Lampa.Noty.show('FanFilm4K: ' + errMsg);
                }
            });
        },

        showMovieTranslations: function (card, fileList, meta) {
            var all = fileList.all || {};
            var items = [];

            function collectTracks(sourceObj, prefix) {
                if (!sourceObj || typeof sourceObj !== 'object' || Array.isArray(sourceObj)) return;
                for (var tKey in sourceObj) {
                    if (!Object.prototype.hasOwnProperty.call(sourceObj, tKey)) continue;
                    var trackGroup = sourceObj[tKey];
                    if (!trackGroup || typeof trackGroup !== 'object' || Array.isArray(trackGroup)) continue;
                    for (var qKey in trackGroup) {
                        if (!Object.prototype.hasOwnProperty.call(trackGroup, qKey)) continue;
                        var fileInfo = trackGroup[qKey];
                        var has4k = fileInfo.uhd === 1;
                        var label = (prefix ? '[' + prefix + '] ' : '') + (fileInfo.translation || 'Стандартная');
                        if (has4k) {
                            label += '  ★ [4K UHD]';
                        }
                        label += ' (' + (fileInfo.quality || qKey) + ')';

                        items.push({
                            title: label,
                            subtitle: has4k ? 'Ultra HD 4K доступно' : (fileInfo.quality || 'HD'),
                            fileInfo: fileInfo,
                            selected: false
                        });
                    }
                }
            }

            collectTracks(all.theatrical, '');
            collectTracks(all.directors, 'Режиссерская');

            if (items.length === 0) {
                FanFilmUI.launchPlayer(card, meta.iframeUrl, null, null, fileList, meta);
                return;
            }

            Lampa.Select.show({
                title: 'FanFilm 4K: Выберите озвучку',
                items: items,
                onSelect: function (selected) {
                    FanFilmUI.launchPlayer(card, meta.iframeUrl, selected.fileInfo, null, fileList, meta);
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        },

        showSerialSeasons: function (card, fileList, meta) {
            var all = fileList.all || {};
            var seasons = Object.keys(all).filter(function (k) {
                return !isNaN(parseInt(k, 10));
            }).sort(function (a, b) {
                return parseInt(a, 10) - parseInt(b, 10);
            });

            if (seasons.length === 0) {
                FanFilmUI.launchPlayer(card, meta.iframeUrl, null, null, fileList, meta);
                return;
            }

            if (seasons.length === 1) {
                FanFilmUI.showSerialEpisodes(card, fileList, meta, seasons[0], true);
                return;
            }

            var items = seasons.map(function (sNum) {
                var epsCount = Object.keys(all[sNum] || {}).length;
                return {
                    title: 'Сезон ' + sNum,
                    subtitle: 'Серий: ' + epsCount,
                    seasonNum: sNum
                };
            });

            Lampa.Select.show({
                title: 'FanFilm 4K: Выберите сезон',
                items: items,
                onSelect: function (selected) {
                    FanFilmUI.showSerialEpisodes(card, fileList, meta, selected.seasonNum, false);
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        },

        showSerialEpisodes: function (card, fileList, meta, seasonNum, singleSeason) {
            var seasonEpisodes = (fileList.all && fileList.all[seasonNum]) || {};
            var episodes = Object.keys(seasonEpisodes).filter(function (k) {
                return !isNaN(parseInt(k, 10));
            }).sort(function (a, b) {
                return parseInt(a, 10) - parseInt(b, 10);
            });

            var items = episodes.map(function (epNum) {
                var trackKeys = Object.keys(seasonEpisodes[epNum] || {});
                var has4k = false;
                for (var i = 0; i < trackKeys.length; i++) {
                    if (seasonEpisodes[epNum][trackKeys[i]] && seasonEpisodes[epNum][trackKeys[i]].uhd === 1) {
                        has4k = true;
                        break;
                    }
                }

                return {
                    title: 'Серия ' + epNum + (has4k ? '  ★ [4K]' : ''),
                    subtitle: 'Озвучек: ' + trackKeys.length + (has4k ? ' • 4K UHD' : ''),
                    epNum: epNum,
                    seasonNum: seasonNum
                };
            });

            Lampa.Select.show({
                title: 'Сезон ' + seasonNum + ' — Выберите серию',
                items: items,
                onSelect: function (selected) {
                    FanFilmUI.showSerialTranslations(card, fileList, meta, selected.seasonNum, selected.epNum, singleSeason);
                },
                onBack: function () {
                    if (singleSeason) {
                        Lampa.Controller.toggle('content');
                    } else {
                        FanFilmUI.showSerialSeasons(card, fileList, meta);
                    }
                }
            });
        },

        showSerialTranslations: function (card, fileList, meta, seasonNum, epNum, singleSeason) {
            var tracks = (fileList.all && fileList.all[seasonNum] && fileList.all[seasonNum][epNum]) || {};
            var items = [];

            for (var k in tracks) {
                if (!Object.prototype.hasOwnProperty.call(tracks, k)) continue;
                var track = tracks[k];
                var has4k = track.uhd === 1;
                var title = track.translation || 'Перевод';
                if (has4k) title += '  ★ [4K UHD]';
                title += ' (' + (track.quality || 'BDRip') + ')';

                items.push({
                    title: title,
                    subtitle: has4k ? 'Доступно в Ultra HD 4K' : (track.quality || 'HD'),
                    fileInfo: track
                });
            }

            Lampa.Select.show({
                title: 'Сезон ' + seasonNum + ' / Серия ' + epNum + ' — Озвучка',
                items: items,
                onSelect: function (selected) {
                    FanFilmUI.launchPlayer(card, meta.iframeUrl, selected.fileInfo, {
                        season: seasonNum,
                        episode: epNum
                    }, fileList, meta);
                },
                onBack: function () {
                    FanFilmUI.showSerialEpisodes(card, fileList, meta, seasonNum, singleSeason);
                }
            });
        },

        launchPlayer: function (card, iframeUrl, fileInfo, episodeContext, fileList, meta) {
            var playerUrl = iframeUrl;
            if (playerUrl.indexOf('autoplay=') === -1) {
                playerUrl += (playerUrl.indexOf('?') >= 0 ? '&' : '?') + 'autoplay=1&tv=1&device=1';
            } else if (playerUrl.indexOf('tv=') === -1) {
                playerUrl += '&tv=1&device=1';
            }

            if (fileInfo && fileInfo.id_translation) {
                playerUrl += '&translation=' + encodeURIComponent(fileInfo.id_translation);
            }
            if (episodeContext) {
                if (episodeContext.season) playerUrl += '&season=' + encodeURIComponent(episodeContext.season);
                if (episodeContext.episode) playerUrl += '&episode=' + encodeURIComponent(episodeContext.episode);
            }

            // Прячем абсолютно все элементы Лампы на фоне
            $('body').addClass('fanfilm4k-fullscreen-active');

            var overlay = $([
                '<div class="fanfilm4k-player-container" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:2147483647 !important;">',
                '  <div class="fanfilm4k-player-bar" style="position:absolute;top:0;left:0;width:100%;padding:12px 24px;z-index:2147483648;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%);pointer-events:none;">',
                '    <div class="fanfilm4k-player-title" style="color:#fff;font-size:16px;font-weight:bold;text-shadow:0 1px 4px #000;"></div>',
                '    <div class="fanfilm4k-player-close selector" title="Назад (или кнопка Назад на пульте)" style="pointer-events:auto;background:rgba(229,9,20,0.9);color:#fff;width:40px;height:40px;line-height:40px;text-align:center;border-radius:50%;cursor:pointer;font-size:18px;font-weight:bold;box-shadow:0 2px 10px rgba(0,0,0,0.7);">✕</div>',
                '  </div>',
                '  <iframe id="fanfilm4k_iframe" tabindex="0" src="' + playerUrl + '" referrerpolicy="unsafe-url" style="width:100%;height:100%;border:none;display:block;" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" allow="autoplay; fullscreen; encrypted-media"></iframe>',
                '</div>'
            ].join(''));

            var titleText = (card.title || card.name || 'FanFilm 4K');
            if (episodeContext && episodeContext.season) {
                titleText += ' — ' + episodeContext.season + ' сезон, ' + episodeContext.episode + ' серия';
            }
            if (fileInfo && fileInfo.translation) {
                titleText += ' (' + fileInfo.translation + ')';
            }
            overlay.find('.fanfilm4k-player-title').text(titleText);

            $('body').append(overlay);

            var closeBtn = overlay.find('.fanfilm4k-player-close');
            var iframe = overlay.find('iframe');

            function focusIframe() {
                try {
                    iframe[0].focus();
                    if (iframe[0].contentWindow) iframe[0].contentWindow.focus();
                } catch (e) {}
            }

            var keyHandler = function (e) {
                var code = e.keyCode || e.which;
                if (code === 27 || code === 8 || code === 10009 || code === 461) {
                    e.preventDefault();
                    e.stopPropagation();
                    closePlayer();
                } else if (code === 13 || code === 32) {
                    focusIframe();
                }
            };

            window.addEventListener('keydown', keyHandler, true);

            function closePlayer() {
                window.removeEventListener('keydown', keyHandler, true);
                $('body').removeClass('fanfilm4k-fullscreen-active');
                overlay.remove();
                if (episodeContext && fileList && meta) {
                    FanFilmUI.showSerialEpisodes(card, fileList, meta, episodeContext.season, false);
                } else if (fileList && meta) {
                    FanFilmUI.showMovieTranslations(card, fileList, meta);
                } else {
                    Lampa.Controller.toggle('content');
                }
            }

            closeBtn.on('hover:enter click', closePlayer);

            Lampa.Controller.add('fanfilm4k_player', {
                toggle: function () {
                    focusIframe();
                },
                back: function () {
                    closePlayer();
                },
                enter: function () {
                    focusIframe();
                }
            });

            Lampa.Controller.toggle('fanfilm4k_player');
            setTimeout(focusIframe, 300);
            setTimeout(focusIframe, 1000);
        }
    };

    function hookFullCard() {
        if (typeof Lampa === 'undefined' || !Lampa.Listener) return;

        function injectButton(e) {
            try {
                var movie = e.data ? e.data.movie : (e.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie));
                if (!movie) return;

                var render = (e.object && e.object.activity && typeof e.object.activity.render === 'function') 
                    ? e.object.activity.render() 
                    : (e.render || $(e.body) || $('.full-start-new, .full-start, .full'));

                if (!render || !render.length) return;

                // 1. Для правого меню источников Lampa (новый интерфейс):
                var btnsContainer = render.find('.buttons--container');
                if (btnsContainer.length && !btnsContainer.find('.view--fanfilm').length) {
                    var sourceBtn = $([
                        '<div class="full-start__button selector view--fanfilm" data-subtitle="Онлайн в 4K UHD">',
                        '  <svg style="width:1.4em;height:1.4em;vertical-align:middle;margin-right:8px;fill:#ffffff;" viewBox="0 0 24 24">',
                        '    <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v1h-2V8H6v5h3.5v-1H11v3h1.5V8H11v3zm7 3c0 .55-.45 1-1 1h-3.5c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1H17c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1 .55 0 1 .45 1 1v2zm-1.5-3.5h-2v-1.5h2v1.5zm0 3h-2v-1.5h2v1.5z"/>',
                        '  </svg>',
                        '  <span>FanFilm 4K</span>',
                        '</div>'
                    ].join(''));

                    sourceBtn.on('hover:enter click', function () {
                        FanFilmUI.open(movie);
                    });

                    btnsContainer.append(sourceBtn);
                }

                // 2. Для стандартного блока кнопок под постером (старый интерфейс или прямой вид)
                if (render.find('.view--fanfilm').length) return;

                var btn = $([
                    '<div class="full-start__button selector view--fanfilm" data-subtitle="Онлайн в 4K UHD" style="background: linear-gradient(135deg, #165b32 0%, #168e5f 100%); margin-bottom: 8px;">',
                    '  <svg style="width:1.4em;height:1.4em;vertical-align:middle;margin-right:8px;fill:#ffffff;" viewBox="0 0 24 24">',
                    '    <path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v1h-2V8H6v5h3.5v-1H11v3h1.5V8H11v3zm7 3c0 .55-.45 1-1 1h-3.5c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1H17c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1 .55 0 1 .45 1 1v2zm-1.5-3.5h-2v-1.5h2v1.5zm0 3h-2v-1.5h2v1.5z"/>',
                    '  </svg>',
                    '  <span>FanFilm 4K</span>',
                    '</div>'
                ].join(''));

                btn.on('hover:enter click', function () {
                    FanFilmUI.open(movie);
                });

                var torrent = render.find('.view--torrent');
                var trailer = render.find('.view--trailer, .button--trailer');
                var newBox = render.find('.full-start-new__buttons, .full-start-new__details');
                var oldBox = render.find('.full-start__buttons');

                if (torrent.length) {
                    torrent.after(btn);
                } else if (trailer.length) {
                    trailer.before(btn);
                } else if (newBox.length) {
                    newBox.prepend(btn);
                } else if (oldBox.length) {
                    oldBox.prepend(btn);
                } else {
                    var anyBtn = render.find('.full-start__button, .button').first();
                    if (anyBtn.length) {
                        anyBtn.after(btn);
                    } else {
                        render.append(btn);
                    }
                }
            } catch (err) {
                console.error('[FanFilm4K] Error injecting button:', err);
            }
        }

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                injectButton(e);
            }
        });

        setTimeout(function () {
            var active = (typeof Lampa !== 'undefined' && Lampa.Activity) ? Lampa.Activity.active() : null;
            if (active && active.component === 'full' && active.movie) {
                injectButton({ data: { movie: active.movie }, object: active });
            }
        }, 800);
    }

    function initSettings() {
        try {
            if (typeof Lampa !== 'undefined' && Lampa.SettingsApi) {
                Lampa.SettingsApi.addComponent({
                    component: 'fanfilm4k',
                    name: 'FanFilm 4K',
                    icon: '<svg height="36" viewBox="0 0 38 38" width="36" style="fill: currentColor"><path d="M21.5 2v6h3V2h-3zm-8 0v6h3V2h-3zm-8 0v6h3V2h-3zm24 0v6h3V2h-3zM3 10v26h32V10H3zm29 23H6V13h26v20z"/></svg>'
                });

                Lampa.SettingsApi.addParam({
                    component: 'fanfilm4k',
                    param: {
                        name: 'fanfilm4k_refresh_mirror',
                        type: 'button'
                    },
                    field: {
                        name: 'Обновить зеркало',
                        description: 'Проверить fanfilmzerkalo.fun и обновить рабочий домен'
                    },
                    onRender: function (item) {
                        item.on('hover:enter click', function () {
                            MirrorManager.forceRefresh();
                        });
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: 'fanfilm4k',
                    param: {
                        name: STORAGE_CUSTOM_KEY,
                        type: 'input',
                        values: '',
                        default: '',
                        placeholder: DEFAULT_MIRROR
                    },
                    field: {
                        name: 'Пользовательский домен',
                        description: 'Оставьте пустым для прямого домена ' + DEFAULT_MIRROR
                    }
                });

                Lampa.SettingsApi.addParam({
                    component: 'fanfilm4k',
                    param: {
                        name: STORAGE_PROXY_URL_KEY,
                        type: 'input',
                        values: '',
                        default: '',
                        placeholder: DEFAULT_CORS_PROXY || 'https://...workers.dev/'
                    },
                    field: {
                        name: 'Пользовательский CORS-прокси',
                        description: 'URL вашего Cloudflare Worker для работы на ТВ через Media Station X'
                    }
                });
            }
        } catch (e) {
            console.error('[FanFilm4K] Settings registration error:', e);
        }
    }

    function init() {
        hookFullCard();
        initSettings();
        console.log('[FanFilm4K] Ready. Default mirror:', DEFAULT_MIRROR);
    }

    if (window.appready) {
        init();
    } else {
        if (typeof Lampa !== 'undefined' && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') init();
            });
        } else {
            setTimeout(init, 1000);
        }
    }
})();
