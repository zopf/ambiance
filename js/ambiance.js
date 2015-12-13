var $ = require('jquery');
var _ = require('underscore');

// Some operational config vars
NUMBER_OF_SOUNDS_TO_MIX = 3;
RANDOM_SOUND_BUCKET_MAX_SIZE = 10;

// First, set up the Clarifai API
var CLARIFAI_CLIENT_ID = 'eWVjQFmzVmjYE419gb1_N1a0ZHBEjPY8HpUgF2Nd';
var CLARIFAI_CLIENT_SECRET = 'yhO_DUgnoUuiRb_v2iDVRaJQxp0FAY6LIn8rTLkS';
var Clarifai = require('./clarifai_node.js');
Clarifai.initAPI(CLARIFAI_CLIENT_ID, CLARIFAI_CLIENT_SECRET);
Clarifai.setThrottleHandler( function( bThrottled, waitSeconds ) { 
  console.log( bThrottled ? ["throttled. service available again in",waitSeconds,"seconds"].join(' ') : "not throttled");
});

// Now, set up the Instagram API
// you can get a new access token using this URL:
// https://www.instagram.com/oauth/authorize/?client_id=bf4523d98a90414f972acdcaef8a4713&redirect_uri=http://zopf.github.io/ambiance&response_type=token&scope=public_content
var INSTAGRAM_ACCESS_TOKEN = '2198953.bf4523d.5e714caead814987a701ce45e74b2374';
var Instafeed = require('instafeed.js');

// Now, set up the Freesound API
var FREESOUND_API_KEY = 'a18861035bd84de6d5c2d0e48c8e8330b49f5fe9';
// NOTE: we're not require'ing ./freesound.js because Browserify doesn't play nicely with the XHR calls it makes, apparently
//   ... instead, we're just copying it into dist and loading it directly
freesound.setToken(FREESOUND_API_KEY);

// Ok, now some global vars our code uses.
// a global to hold our currently playing audio objects, so we can e.g. pause them
var playingAudios = [];
// a global to hold our local db of images
var imgDetails = {};

// Alright!  Now a bunch of functions.

function updateLoadingProgress() {
  var numberOfImages = $('#images img').length;
  var numberOfResults = 0;
  for(imgId in imgDetails) {
    var details = imgDetails[imgId];
    if(details.tags)
      numberOfResults += 1;
    if(details.sounds)
      numberOfResults += 1;
  }
  var pctLoaded = Math.round(1000*numberOfResults/(2*numberOfImages))/10;
  $('#loadingbox').text('Loading Progress: '+pctLoaded+'%');
}

function getIDFromInsta(url) {
  return url.replace(/^[^a-z]+|[^\w-]+/gi, "");
}

function stopAudios() {
  _.map(playingAudios, function(audio){
    audio.pause();
  });
  playingAudios.length = 0;
}

function handleImageClick() {
  stopAudios();
  var img = $(this);
  $('#images .insta').removeClass("playing");
  img.parent().addClass("playing");
  var imgId = img.attr('id');
  var sounds = getSoundsForImage(imgId);
  console.log('sounds for image:', sounds);
  var soundURLs = _.map(sounds, function(sound){
    return sound.previews['preview-hq-mp3'];
  });
  var audios = _.map(
    _.uniq(soundURLs), 
    function(url){
      return new Audio(url);
    }
  );
  _.map(audios, function(audio){
    console.log('playing audio', audio);
    playingAudios.push(audio);
    $(audio).bind('ended', function()  {
      audio.currentTime = 0;
      audio.play();
    });
    audio.play();
  });
}

function addImgToUI(img, id) {
  $('#images').append(
    '<div class="insta" id="insta_'+id+'">'+
    '<img src="'+img.url+'" id="'+id+'" width="'+img.width+'" height="'+img.height+'"/>'+
    '<div class="tags"></div>'+
    '</div>'
  );
}

function updateImageUI() {
  $('#images img').on("click", handleImageClick);
}

function setDetailsForImage(imgId, details) {
  imgDetails[imgId] = details;
  updateLoadingProgress();
}

function setTagSubsetForImage(imgId, subset) {
  imgDetails[imgId].tagSubset = subset;
  var rendering = _.map(subset, function(tag){
    return '<span>'+tag+'</span>';
  });
  var selector = '#insta_'+imgId+' .tags';
  console.log('trying to get selector: "'+selector+'"');
  $(selector).html(rendering.join(', '));
}

function addSoundForImage(imgId, sound) {
  console.log('Adding sound for img '+imgId+';  sound:', sound);
  if(imgDetails[imgId] == null) {
    imgDetails[imgId] = {};
  }
  if(imgDetails[imgId].sounds == null) {
    imgDetails[imgId].sounds = [];
  }
  imgDetails[imgId].sounds.push(sound);
  console.log('Ok, heres the resulting img details:', imgDetails[imgId]);
  updateLoadingProgress();
}

function getSoundsForImage(imgId) {
  return imgDetails[imgId].sounds;
}

function removeAnnoyingTags(tags) {
  return _.without(tags,
    'no person'
  );
}

function fetchSoundsForTags(tagSets) {
  console.log('Beginning fetching sounds for tags.');
  var first = true;
  _.map(tagSets, function(tagSet){
    // if(first) {
    //   console.log('Processing first tag set...');
    //   first = false;
    // } else {
    //   return;
    // }
    // choose a subset of the tags to process
    var tagSubset = _.first(removeAnnoyingTags(tagSet.tags), NUMBER_OF_SOUNDS_TO_MIX);
    console.log('Chose the following tags:', tagSubset);
    setTagSubsetForImage(tagSet.id, tagSubset);
    // select a single sound for each tag in the subset
    _.map(tagSubset, function(tag){
      var query = tag;
      var page = 1;
      var filter = "duration:[7.0 TO 30.0]";
      var sort = "score";
      var fields = 'id,name,url,previews';
      console.log('Searching freesound for the tag "'+query+'"...');
      freesound.textSearch(query, {page:page, filter:filter, sort:sort, fields:fields}, 
        function(sounds){
          var randMax = Math.min(sounds.count, RANDOM_SOUND_BUCKET_MAX_SIZE);
          var soundIdx = Math.floor(Math.random()*(randMax-.001));
          console.log('getting sound at index:', soundIdx, 'out of', sounds.count, 'sounds');
          var snd = sounds.getSound(soundIdx);
          console.log('Chose sound:', snd);
          // also available: snd.name, snd.username
          addSoundForImage(tagSet.id, snd);
        },
        function(err){ 
          // error handler here...
          console.log('Freesound ERROR!', err);
        }
      );
    });
  });
}

function handleClarifaiResult(clarifaiErr, clarifaiRes){
  var tagSets = _.map(clarifaiRes.results, function(d){
    var details = {
      id: getIDFromInsta(d.local_id),
      tags: d.result.tag.classes,
      weights: d.result.tag.probs
    };
    setDetailsForImage(details.id, details);
    return details;
  });
  // process tags into soundscapes
  fetchSoundsForTags(tagSets);
}

function tagImages(imgFullURLs) {
  var tagResults = Clarifai.tagURL(imgFullURLs, imgFullURLs, handleClarifaiResult); 
}

function handleInstagramResults(instagramRes) {
  // first, let's kill the existing images
  $('#images').empty();
  // great.  let's process all the instagram data
  var imgFullURLs = _.map(instagramRes.data, function(o){
    var img =     o.images.low_resolution;
    var fullImg = o.images.standard_resolution;
    var id =      getIDFromInsta(fullImg.url);
    // add the image to the UI with the proper ID
    addImgToUI(img, id);
    return fullImg.url;
  });
  updateImageUI();
  // pass to Clarifai for tagging
  tagImages(imgFullURLs);
}

// Let's set up the feed
var feed = new Instafeed({
    get: 'user',
    userId: '2198953',
    accessToken: INSTAGRAM_ACCESS_TOKEN,
    success: handleInstagramResults
});
feed.run();

