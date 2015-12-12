var $ = require('jquery');
var _ = require('underscore');

// Some operational config vars
NUMBER_OF_SOUNDS_TO_MIX = 3;
RANDOM_SOUND_BUCKET_MAX_SIZE = 5;

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
var freesound = require('./freesound.js');
freesound.setToken(FREESOUND_API_KEY);


// Great, let's get started.
// First, a utility function to get a valid ID from an instagram URL
function getIDFromInsta(url) {
  return url.replace(/^[^a-z]+|[^\w:.-]+/gi, "");
}

function addImgToUI(img, id) {
  $('#images').append(
    '<div class="insta">'+
    '<img src="'+img.url+'" id="'+id+'" width="'+img.width+'" height="'+img.height+'" />'+
    '<div class="tags"></div>'+
    '</div>'
  );
}

// a global to hold our local db of images
var imgDetails = {};

function setDetailsForImage(imgId, details) {
  imgDetails[imgId] = details;
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
}

function fetchSoundsForTags(tagSets) {
  console.log('Beginning fetching sounds for tags.');
  var first = true;
  _.map(tagSets, function(tagSet){
    if(first) {
      console.log('Processing first tag set...');
      first = false;
    } else {
      return;
    }
    // choose a subset of the tags to process
    var tagSubset = _.first(tagSet.tags, NUMBER_OF_SOUNDS_TO_MIX);
    console.log('Chose the following tags:', tagSubset);
    // select a single sound for each tag in the subset
    _.map(tagSubset, function(tag){
      var query = tag;
      var page = 1;
      var filter = "duration:[1.0 TO 10.0]";
      var sort = "score";
      var fields = 'id,name,url';
      console.log('Searching freesound for the tag "'+query+'"...');
      freesound.textSearch(query, {page:page, filter:filter, sort:sort, fields:fields}, 
        function(sounds){
          console.log('Got Freesound result!', sounds);
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

