$(document).ready(function() {
    // Compile template
    var feedItemSource = $("#feeditem").html();
    var customResultSource = $("#custom_result").html();
    var editItemSource = $("#edititem").html();
    var feedItemTemplate = Handlebars.compile(feedItemSource);
    var editItemTemplate = Handlebars.compile(editItemSource);
    var customResultTemplate = Handlebars.compile(customResultSource);

    var updateFormDialog = null
    var clipboard = null;

    var isInitial = false;
    var lasted_url_item = null;
    var feed_per_page = 10;
    var colorPicker = '';

    // Initial plugin 
    $('#colorPicker').colorPicker({
        onChange: function (color) {
            colorPicker = color;
            console.log('test', color);
        }
    });

    // Load timeline
    function loadFeed(start_at, limit) {
        var conditions = {};
        conditions.is_public = 1;

        if (window['is_user_feed_only'] != void 0) {
            conditions = {
                user_id: force_userid || app.user._id || '',
                is_public: { $in : [0, 1] }
            };
        }

        if (start_at)
            conditions = $.extend(conditions, {
                created: {
                    $lt: start_at
                }
            });

        var limit = limit || feed_per_page;
        var uid = window.app.user && window.app.user._id ? window.app.user._id : '';

        $.get(app.api_endpoint + '/url', {
            conditions: JSON.stringify(conditions),
            limit: limit,
            sort: '-created',
            uid: uid
        }, function(data) {
            lasted_url_item = data.slice(-1).pop();
            if (data) $('.feed').append(feedItemTemplate({
                app: app,
                urls: data,
                user: app.user
            }));
            initialFeedScript();
            $('.load-more').text('more');
            if (!data.length) $('.load-more').text('');
        });
    }

    if ($('.feed').text().trim() == '') {
        $('.load-more').text('loading ...');
    }

    // Load 
    loadFeed(null, 10);
    $('.load-more').click(function() {
        if (lasted_url_item) loadFeed(lasted_url_item.created, 5);
    });

    // ======================================
    // Add new note 
    $('#noteSubmit').click(function(e) {
        e.preventDefault();
        doAdd('note');
    });

    // ======================================
    // Add new URL
    $('#quickForm').on('submit', function(e) {
        e.preventDefault();
        doAdd('url');
    });

    function doAdd(mode) {

        var mode = mode || 'url';
        var dataInput = $('#quick-url').val();
        var is_url = false;
        var error = false;

        // Add URL or search
        if (dataInput && isURL && isURL(dataInput)) is_url = true;
        if (mode == 'url' && true !== is_url) {
            mode = 'search';
        }

        // Add note
        if (mode == 'note') {
            dataInput = $('#saveto-note').val();
            if (!dataInput || dataInput.length < 2) {
                return alertify.error('please enter your content');
            }
        }

        var data = {
            data: dataInput,
            color: colorPicker,
            user_id: app.user._id,
            access_token: app.user.access_token
        };

        if (mode == 'search') {
            $('.feed').html('');
            $('.load-more').text('loading ...');    
        }
        
        $.post(app.api_endpoint + '/' + mode, data, function(data) {
            if (data && (mode == 'url' || mode == 'note')) {
                $('#quick-url').val(''); // clear URL box
                $('#saveto-note').val(''); // clear note box

                data.is_loading = true;
                $('.feed').prepend(feedItemTemplate({
                    urls: [data],
                    user: app.user
                }));

                initialFeedScript();

                // Fetch URL Meta Tab
                if (mode == 'url') {
                    fetchUrlData(dataInput, function(err, data_fetched) {
                        if (err || !data_fetched) {
                            $('.fa.fa-spinner.fa-pulse').hide();
                            return;
                        }

                        // Update data
                        data = $.extend(data, data_fetched);
                        data.is_loading = false;

                        // Sync back server
                        updateUrlItem(data);

                        var newrender = feedItemTemplate({
                            urls: [data],
                            user: app.user
                        });
                        
                        $('#item-' + data._id).html($(newrender).html());
                        $('#item-' + data._id).attr('data-raw', JSON.stringify(data));

                        initialFeedScript();
                    });
                }
                
            } else if (data && mode == 'search') {
                console.info(data);
                $('.feed').html('');
                
                if (data && data.length == 2) {
                    // Data[0] is custom html results
                    if (data[0].type == 'html')
                        $('.feed').append(customResultTemplate({
                            app: app,
                            data: data[0],
                            user: app.user
                        }));

                    $('.load-more').text('');
                    data.shift();
                }
                
                if (data && data.length == 1) {
                    $('.feed').append(feedItemTemplate({
                        app: app,
                        urls: data[0],
                        user: app.user
                    }));
                    initialFeedScript();
                    $('.load-more').text('');
                }
            }
        }).fail(function() {
            alertify.error('ops, try again.');
            if (!app.user || !app.user._id) alertify.error('please login');
        });
    }

    function fetchUrlData(url, cb) {
        $.get(app.base_url + 'api/v1/url/parser', {
            url: url
        }, function(data) {
            url_fetched = data;
            if (cb) cb(null, data);
        }).error(function() {
            if (cb) cb('error parser', {});
            url_fetched = {};
        })
    }

    function updateUrlItem(item) {
        if (!item) return false;

        var data = $.extend(item, {
            user_id: app.user._id,
            access_token: app.user.access_token
        });

        $.post(app.api_endpoint + '/url/' + item._id, data, function(result) {
            alertify.message('synced');
        }).error(function() {
            alertify.error('sync is currently experiencing problems');
        });
    }

    function onNoteCardModalShow(ele) {
        var card_content = $(ele).find('.card-note-content');

        if (!ele || !card_content) {
            return $('#viewSavetoNote').modal('hide');
        }

        var content = card_content.html();
        var data = card_content.data('data');
        var color = card_content.data('color');
        var slug = card_content.data('slug');

        $('.note-modal-content').html(content);

        // Update URL Slug
        window.location.hash = slug;

        $('#viewSavetoNote').find('.modal-content').removeClass().addClass('modal-content');
        if (color) $('#viewSavetoNote').find('.modal-content').addClass('modal-inverse modal-' + color);
    }

    function removeHash () { 
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }

    function doReport(itemId, cb) {
        if (!itemId) cb('Missing ID');

        var data = {
            user_id: app.user ? (app.user._id || '') : '',
            access_token: app.user.access_token,
            itemId: itemId
        };

        $.post(app.api_endpoint + '/report/' + itemId, data, function(result) {
            cb();
        }).error(function() {
            cb('sync is currently experiencing problems');
        });
    }

    function initialFeedScript() {
        // Tooltip
        $('[data-toggle="tooltip"]').tooltip();

        // Show note card modal
        $('.card-note').click(function(event) {
            onNoteCardModalShow(this, true /* hack = true */);
        });

        // Remove hash when hidden model review
        $('#viewSavetoNote').on('hidden.bs.modal', function () {
            removeHash();
        });

        // View modal when reload (F5)
        if (!!window.location.hash) {
            var slug = window.location.hash.substr(1);
            if (!!slug && slug != 'undefined') {
                var ele = $('.card-note[data-slug='+ slug +'][data-root=1]');
                console.log(ele)
                if (!!ele) {
                    $('#viewSavetoNote').modal('show');
                    onNoteCardModalShow(ele);
                } else {
                    // TODO: Load ajax 
                    removeHash();
                }
            } else {
                removeHash();
            }
        }

        // Start GIF
        if (typeof Gifffer != undefined) Gifffer();

        // Share
        $('.share-this').click(function() {
            var share_url = $(this).data('url');
            alertify.prompt("share this via URL", share_url).set('onok', function(closeEvent) {
                if (0 == closeEvent.index) {
                    copy(share_url, function(err) {
                        if (!err) return alertify.message("Copied!");   
                    });
                }
            });
        });

        // Detect Ctrl press
        $(document).keydown(function(e) {
            if (e.which == '17') ctrlPressed = true;
        });
        $(document).keyup(function() {
            ctrlPressed = false;
        });
        var ctrlPressed = false;

        // Clipboard 
        if (clipboard != null) clipboard.destroy();
        clipboard = new Clipboard('.short_url_item');
        clipboard.on('success', function(e) {
            if (ctrlPressed) {
                window.location = e.text;
                return true;
            }

            alertify.message("Copied!");
        });
        clipboard.on('error', function(e) {
            alertify.message("ops, using right click > copy.");
        });

        // Edit form 
        $('.url-item .editBtn').click(function(e) {
            // TODO: Open modal to edit 

            e.preventDefault();
            var data = $(this).data('item');
            if (data) {
                updateFormDialog = alertify.itemEditBox(data, app.user, function(box) {
                    var root = $(box.elements.body);
                });
            }
            else alertify.message('Ops, error!');
        });

        // Flag 
        $('.url-item .flag-this').click(function(e) {
            // TODO: Open modal to edit 

            e.preventDefault();
            var itemId = $(this).data('id');
            if (itemId) {
                doReport(itemId, function(err) {
                    if (err) alertify.message(err);
                    else alertify.message('Reported!');
                })
            }
            else alertify.message('Ops, error!');
        });

        $('.tags .update-tags').click(function(e) {
            e.preventDefault();
            var _id = $(this).data('url-id');
            if (!_id) return alert('something went wrong!');

            var item = $( '#item-' + _id);
            if (!item) return false;

            var p = $(item).find('.list-tags').hide();
            
            var inputTags = $(item).find('.input-tags');
            if (inputTags) {
                inputTags.show();
                var form_row = inputTags.find('input.input-tags-form');
                if (form_row) {
                    $(form_row).tagsinput({
                        maxTags: 3,
                        maxChars: 20,
                        trimValue: true,
                        confirmKeys: [13, 44]
                    });

                    $(form_row).on('itemAdded itemRemoved', function() {
                        var data = $(item).data('raw');
                        var tags = $(this).tagsinput('items');
                        if (!tags) return false;
                        
                        data.tags = $(this).tagsinput('items');

                        // Sync back server
                        updateUrlItem(data);

                        var newrender = feedItemTemplate({
                            urls: [data],
                            user: app.user
                        });
                        $('#item-' + data._id).html($(newrender).html());
                        // initialFeedScript();
                    });
                }
            }
        });

    }

    if (!alertify.itemEditBox) {
        //define a new dialog
        alertify.dialog('itemEditBox', function() {
            return {
                main: function(data, user, callback) {
                    this.set('title', 'edit');
                    this.setting('item', data);
                    this.setting('frameless', true);

                    if (callback) callback(this);

                    this.setContent(editItemTemplate({
                        item: data,
                        user: user
                    }))
                },
                setup: function() {
                    return {
                        buttons: [{
                            text: 'Save',
                            className: alertify.defaults.theme.ok,
                            key: 9,
                            attrs: {
                                attribute: 'value'
                            },

                        }, ],
                        focus: {
                            element: 0
                        },
                        options: {
                            resizable: true,
                            modal: false,
                            transition: 'flipx'
                        }
                    };
                },
                build: function() {
                    this.elements.body.style.minHeight = '430px';
                    this.elements.content.style.padding = '5px 0';
                    this.elements.content.style.overflow = 'hidden';
                }
            }
        });
    }


});
