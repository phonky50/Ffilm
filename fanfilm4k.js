/**
 * Plugin Name: FanFilm 4K
 * Description: Онлайн-просмотр 4K UHD фильмов и сериалов с зеркал FanFilm4K для Lampa
 */

(function () {
    'use strict';

    if (window.plugin_fanfilm4k_ready) return;
    window.plugin_fanfilm4k_ready = true;

    var ZERKALO_PORTAL = 'https://fanfilmzerkalo.fun/';
    var STORAGE_MIRROR_KEY = 'fanfilm4k_active_mirror';
    var STORAGE_CUSTOM_KEY = 'fanfilm4k_custom_mirror';
    var STORAGE_PREF_QUALITY = 'fanfilm4k_pref_quality';
    var STORAGE_PROXY_KEY = 'fanfilm4k_use_proxy';

    var DEFAULT_MIRROR = 'https://v17.fanfilm4k.media';

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

        var isBrowser = typeof window !== 'undefined' && window.location && window.location.hostname && !window.location.hostname.includes('localhost') && window.location.protocol.indexOf('http') === 0;
        var useProxy = getStorage(STORAGE_PROXY_KEY, isBrowser);
        var finalUrl = url;
        if (useProxy && !url.includes('corsproxy.io') && !url.includes('api.allorigins.win')) {
            finalUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
        }

        if (typeof Lampa !== 'undefined' && Lampa.Reguest) {
            var network = new Lampa.Reguest();
            network.silent(finalUrl, function (response) {
                onSuccess(response);
            }, function (err) {
                if (onError) onError(err);
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
            if (onError) onError(new Error('Network request failed'));
        };

        xhr.ontimeout = function () {
            if (onError) onError(new Error('Request timed out'));
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
        activeMirror: null,

        getMirror: function (callback) {
            var custom = getStorage(STORAGE_CUSTOM_KEY, '').trim();
            if (custom) {
                callback(custom.replace(/\/+$/, ''));
                return;
            }

            if (this.activeMirror) {
                callback(this.activeMirror);
                return;
            }

            var cached = getStorage(STORAGE_MIRROR_KEY, '');
            if (cached) {
                this.checkHealth(cached, function (ok) {
                    if (ok) {
                        MirrorManager.activeMirror = cached;
                        callback(cached);
                    } else {
                        MirrorManager.resolveFromPortal(callback);
                    }
                });
            } else {
                this.resolveFromPortal(callback);
            }
        },

        checkHealth: function (url, callback) {
            request(url, { timeout: 4000 }, function () {
                callback(true);
            }, function () {
                callback(false);
            });
        },

        resolveFromPortal: function (callback) {
            request(ZERKALO_PORTAL, { timeout: 8000 }, function (html) {
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
                var title = card.title || card.name || '';
                var origTitle = card.original_title || card.original_name || '';
                var year = parseInt((card.release_date || card.first_air_date || '0000').substring(0, 4), 10);

                function doSearch(query, onDone, onFail) {
                    request(mirror + '/index.php?do=search', {
                        method: 'POST',
                        data: {
                            do: 'search',
                            subaction: 'search',
                            search_start: 0,
                            full_search: 0,
                            result_from: 1,
                            story: query
                        }
                    }, function (html) {
                        var matches = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+\/([0-9]+-[^"']+\.html))["'][^>]*>([\s\S]*?)<\/a>/gi)];
                        var items = [];
                        var seen = {};

                        for (var i = 0; i < matches.length; i++) {
                            var link = matches[i][1];
                            if (seen[link]) continue;
                            seen[link] = true;

                            var text = matches[i][3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                            items.push({
                                url: link,
                                text: text
                            });
                        }

                        if (items.length > 0) {
                            onDone(items);
                        } else {
                            onFail();
                        }
                    }, onFail);
                }

                doSearch(title, function (items) {
                    FanFilmSource.pickBestMatch(items, title, origTitle, year, onResult, mirror);
                }, function () {
                    if (origTitle && origTitle.toLowerCase() !== title.toLowerCase()) {
                        doSearch(origTitle, function (items) {
                            FanFilmSource.pickBestMatch(items, title, origTitle, year, onResult, mirror);
                        }, function () {
                            onError('Контент не найден на FanFilm4K');
                        });
                    } else {
                        onError('Контент не найден на FanFilm4K');
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
                onResult({ error: 'Ошибка загрузки страницы: ' + err.message });
            });
        },

        loadIframeData: function (iframeUrl, referer, onResult) {
            request(iframeUrl, {
                headers: {
                    'Referer': referer
                }
            }, function (html) {
                var fileListMatch = html.match(/const fileList = JSON\.parse\('(.*?)'\);/);
                if (!fileListMatch) {
                    onResult({ error: 'Структура плейлиста не найдена в плеере' });
                    return;
                }

                try {
                    var fileList = JSON.parse(fileListMatch[1]);
                    onResult({
                        fileList: fileList,
                        iframeUrl: iframeUrl,
                        referer: referer
                    });
                } catch (e) {
                    onResult({ error: 'Ошибка разбора плейлиста' });
                }
            }, function (err) {
                onResult({ error: 'Ошибка доступа к плееру: ' + err.message });
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

                var fileList = res.fileList;
                if (fileList.type === 'movie') {
                    FanFilmUI.showMovieTranslations(card, fileList, res);
                } else if (fileList.type === 'serial') {
                    FanFilmUI.showSerialSeasons(card, fileList, res);
                } else {
                    FanFilmUI.launchPlayer(card, res.iframeUrl);
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
            var theatrical = all.theatrical || {};
            var directors = all.directors || {};
            var items = [];

            function collectTracks(sourceObj, prefix) {
                for (var tKey in sourceObj) {
                    if (!Object.prototype.hasOwnProperty.call(sourceObj, tKey)) continue;
                    var trackGroup = sourceObj[tKey];
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

            collectTracks(theatrical, '');
            collectTracks(directors, 'Режиссерская');

            if (items.length === 0) {
                FanFilmUI.launchPlayer(card, meta.iframeUrl);
                return;
            }

            Lampa.Select.show({
                title: 'FanFilm 4K: Выберите озвучку',
                items: items,
                onSelect: function (selected) {
                    FanFilmUI.launchPlayer(card, meta.iframeUrl, selected.fileInfo);
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        },

        showSerialSeasons: function (card, fileList, meta) {
            var all = fileList.all || {};
            var seasons = Object.keys(all).sort(function (a, b) {
                return parseInt(a, 10) - parseInt(b, 10);
            });

            if (seasons.length === 0) {
                FanFilmUI.launchPlayer(card, meta.iframeUrl);
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
                    FanFilmUI.showSerialEpisodes(card, fileList, meta, selected.seasonNum);
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        },

        showSerialEpisodes: function (card, fileList, meta, seasonNum) {
            var seasonEpisodes = fileList.all[seasonNum] || {};
            var episodes = Object.keys(seasonEpisodes).sort(function (a, b) {
                return parseInt(a, 10) - parseInt(b, 10);
            });

            var items = episodes.map(function (epNum) {
                var trackKeys = Object.keys(seasonEpisodes[epNum] || {});
                var has4k = false;
                for (var i = 0; i < trackKeys.length; i++) {
                    if (seasonEpisodes[epNum][trackKeys[i]].uhd === 1) {
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
                    FanFilmUI.showSerialTranslations(card, fileList, meta, selected.seasonNum, selected.epNum);
                },
                onBack: function () {
                    FanFilmUI.showSerialSeasons(card, fileList, meta);
                }
            });
        },

        showSerialTranslations: function (card, fileList, meta, seasonNum, epNum) {
            var tracks = fileList.all[seasonNum][epNum] || {};
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
                    });
                },
                onBack: function () {
                    FanFilmUI.showSerialEpisodes(card, fileList, meta, seasonNum);
                }
            });
        },

        launchPlayer: function (card, iframeUrl, fileInfo, episodeContext) {
            var title = (card.title || card.name || 'FanFilm 4K');
            if (episodeContext) {
                title += ' (S' + episodeContext.season + 'E' + episodeContext.episode + ')';
            }
            if (fileInfo && fileInfo.translation) {
                title += ' [' + fileInfo.translation + ']';
            }

            var overlay = $([
                '<div class="fanfilm4k-player-container" style="position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:999999;">',
                '  <div class="fanfilm4k-player-bar" style="position:absolute;top:0;left:0;width:100%;padding:15px 25px;background:linear-gradient(to bottom, rgba(0,0,0,0.85), transparent);z-index:100;display:flex;align-items:center;justify-content:space-between;color:#fff;font-family:sans-serif;">',
                '    <div style="font-size:1.2em;font-weight:bold;">' + title + '</div>',
                '    <div class="fanfilm4k-player-close selector" style="background:#e50914;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;">✕ Закрыть</div>',
                '  </div>',
                '  <iframe src="' + iframeUrl + '" style="width:100%;height:100%;border:none;" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"></iframe>',
                '</div>'
            ].join(''));

            $('body').append(overlay);

            var closeBtn = overlay.find('.fanfilm4k-player-close');

            function closePlayer() {
                overlay.remove();
                Lampa.Controller.toggle('content');
            }

            closeBtn.on('hover:enter click', closePlayer);

            Lampa.Controller.add('fanfilm4k_player', {
                toggle: function () {
                    Lampa.Controller.collectionSet(overlay);
                    Lampa.Controller.collectionFocus(closeBtn[0], overlay);
                },
                back: function () {
                    closePlayer();
                },
                enter: function () {
                    closePlayer();
                }
            });

            Lampa.Controller.toggle('fanfilm4k_player');
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

                // 1. Critical for Lampa's "Источник" sidebar menu (new layout):
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

                // 2. Also inject into full-start card view directly (above trailers or in button bar)
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
        if (typeof Lampa !== 'undefined' && Lampa.SettingsApi) {
            Lampa.SettingsApi.addParam({
                component: 'fanfilm4k',
                param: {
                    name: 'fanfilm4k_refresh_mirror',
                    type: 'static',
                    default: ''
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
                    default: ''
                },
                field: {
                    name: 'Пользовательский домен',
                    description: 'Оставьте пустым для автоопределения с fanfilmzerkalo.fun'
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'fanfilm4k',
                param: {
                    name: STORAGE_PROXY_KEY,
                    type: 'trigger',
                    default: false
                },
                field: {
                    name: 'CORS Прокси',
                    description: 'Включите при запуске Lampa в браузере (web)'
                }
            });
        }
    }

    function init() {
        hookFullCard();
        initSettings();
        MirrorManager.getMirror(function (resolved) {
            console.log('[FanFilm4K] Active mirror resolved:', resolved);
        });
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
