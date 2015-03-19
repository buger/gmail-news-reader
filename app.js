var Google = (function(){
  var clientId = '18132784689-ebqhe8ekabrrck6jmbci2u1c9acg0gii.apps.googleusercontent.com';

  var scopes = 'https://mail.google.com/,https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/gmail.readonly';

  function handleClientLoad() {
    window.setTimeout(checkAuth,1);
  }

  function checkAuth() {
    gapi.auth.authorize({client_id: clientId, scope: scopes, immediate: true}, handleAuthResult);
  }

  function signOut(){
    var iframe = $('<iframe id="logoutframe" src="https://accounts.google.com/logout" style="display: none"></iframe>');
    iframe.appendTo(document.body)
    iframe.on('load', function(){
        window.location.reload();
    })
  }

  function handleAuthResult(authResult) {
    var authorizeButton = $('#authorize-button');
    var splash = $('#splash')
    var spinner = $('#splash .spinner')

    if (authResult && !authResult.error) {
      splash.hide()
      loadGmailAPI(App.init);
    } else {
      authorizeButton.show()
      spinner.hide()
      authorizeButton.on('click', handleAuthClick)
    }
  }

  function handleAuthClick(event) {
    // Step 3: get authorization to use private data
    gapi.auth.authorize({client_id: clientId, scope: scopes, immediate: false}, handleAuthResult);
    return false;
  }

  function loadGmailAPI(callback) {
    gapi.client.load('gmail', 'v1').then(callback);
  }

  function messageRequest(id, params) {
    return gapi.client.request({
      'path': 'gmail/v1/users/me/messages/' + id,
      'params': params
    })
  }

  function listMessages(query, nextPageToken, callback) {
    request = gapi.client.gmail.users.messages.list({
      'userId': 'me',
      'pageToken': nextPageToken,
      'fields': 'messages/id,nextPageToken',
      'q': query
    }).execute(function(resp){
      console.warn(resp)

      var nextPageToken = resp.nextPageToken;
      var batch = gapi.client.newBatch();

      resp.messages.forEach(function(message){
        batch.add(messageRequest(message.id, { format: 'full' }))
      })

      batch.execute(function(resp){
        callback(resp, nextPageToken)
      })
    })
  }

  function modifyMessage(messageId, labelsToAdd, labelsToRemove, callback) {
    var request = gapi.client.gmail.users.messages.modify({
      'userId': 'me',
      'id': messageId,
      'addLabelIds': labelsToAdd,
      'removeLabelIds': labelsToRemove
    })

    request.execute(callback)
  }

  return {
    handleClientLoad: handleClientLoad,
    listMessages: listMessages,
    modifyMessage: modifyMessage,
    signOut: signOut
  }
}())

window.handleClientLoad = Google.handleClientLoad;

var App = (function(){

  function init() {
    $('header .config-filter').html(App.search_filter)

    if (!App.mark_read) {
      $('header .config-mark-read').addClass('disabled')
    }

    listMessages()
  }

  function listMessages(nextPageToken) {
    App.loading = true

    if (nextPageToken == null) {
      $('section ul').html('')
    }
    $('section').append("<div class='spinner'></div>")

    Google.listMessages(App.search_filter, nextPageToken, function(messages, nextPageToken){
      console.warn(messages)
      App.nextPageToken = nextPageToken
      App.messages = $.extend(App.messages, messages)

      renderMessages(messages)
    })
  }

  function renderMessages(messages) {
    var html = ''

    for (k in messages) {
      html += "<li data-id='"+k+"' class='" + messages[k].result.labelIds.join(' ') + "'>"
      html += "<h4>"
      html += _.find(messages[k].result.payload.headers, 'name', 'Subject').value
      html += "</h4>"
      html += "<p>" + messages[k].result.snippet + "</p>"
      html += "<a href='#' class='mark-read'>Mark as read</a>"
      html += "<a href='#' class='mark-unread'>Mark as unread</a>"
      html += "</li>"
    }

    $('section ul').append(html)
    $('section .spinner').remove()

    App.loading = false
  }

  function setSearchFilter(filter) {
    App.search_filter = filter
    window.localStorage.search_filter = filter
    App.listMessages()
  }

  function setMarkRead(mark_read) {
    App.mark_read = mark_read
    window.localStorage.mark_read = mark_read
  }

  return {
    loading: false,
    nextPageToken: null,
    search_filter: window.localStorage.search_filter || "label:unread",
    mark_read: window.localStorage.mark_read == 'false' ? false : true,
    messages: {},
    init: init,
    listMessages: listMessages,
    setSearchFilter: setSearchFilter,
    setMarkRead: setMarkRead
  }
}())


$(document).on('click', '.signout', function(){
  Google.signOut()
})


var urlRegex =/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

function extractUrlFromText(text) {
  var urls = text.match(urlRegex)

  for (var i=0; i<urls.length; i++) {
    if (urls[i].match(/^http:\/\/t\.co/)) {
      return urls[i]
    }
  }

  return urls[0]
}


$(document).on('click', 'header .config-filter', function(){
  var filter = prompt("Please enter search filter, same format as used in Gmail search", App.search_filter)

  if (filter != null) {
    $(this).html(filter)
    App.setSearchFilter(filter)
  }
})


$(document).on('click', 'header .config-mark-read', function(){
  $(this).toggleClass('disabled');
  App.setMarkRead(!$(this).hasClass('disabled'))
})


$(document).on('click', 'section li .mark-unread', function(){
  var message_id = $(this.parentNode).data('id')
  var message = App.messages[message_id]

  $(this.parentNode).addClass('UNREAD')
  Google.modifyMessage(message.result.id, ['UNREAD'], [])

  return false;
})

$(document).on('click', 'section li .mark-read', function(){
  var message_id = $(this.parentNode).data('id')
  var message = App.messages[message_id]

  $(this.parentNode).removeClass('UNREAD')
  Google.modifyMessage(message.result.id, [], ['UNREAD'])

  return false;
})

$(document).on('click', 'section li', function(){
  var message_id = $(this).data('id')
  var message = App.messages[message_id]

  var body = message.result.payload.body.data || message.result.payload.parts[1].body.data

  body = atob(body.replace(/-/g, '+').replace(/_/g, '/'))

  window.open(extractUrlFromText(body))

  if (App.mark_read) {
    $(this).removeClass('UNREAD')
    Google.modifyMessage(message.result.id, [], ['UNREAD'])
  }
})

$(window).scroll(function(){
  if ($(window).scrollTop() + $(window).height() > $(document).height() - 300) {
    if (!App.loading && App.nextPageToken) {
      App.listMessages(App.nextPageToken);
    }
  }
})
