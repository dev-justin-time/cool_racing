var bkcore = bkcore || {};

bkcore.Audio = {};
bkcore.Audio.sounds = {};

bkcore.Audio.init = function(){
	if(window.AudioContext||window.webkitAudioContext){
		bkcore.Audio._ctx = new (window.AudioContext||window.webkitAudioContext)();

		// Master gain: a single mute point in front of every sound.
		// Sound nodes reset their own gain on play(), so muting must sit
		// upstream of them to be reliable.
		bkcore.Audio._masterGain = bkcore.Audio._ctx.createGain();
		bkcore.Audio._masterGain.connect(bkcore.Audio._ctx.destination);

		bkcore.Audio._panner = bkcore.Audio._ctx.createPanner();
		bkcore.Audio._panner.connect(bkcore.Audio._masterGain);
	}
	else {
		bkcore.Audio._ctx = null;
	}

	bkcore.Audio.posMultipler = 1.5;
};

bkcore.Audio.setMuted = function(muted){
	if(bkcore.Audio._masterGain != null)
	{
		bkcore.Audio._masterGain.gain.value = muted ? 0 : 1;
		return;
	}
	// Old-Safari HTML5 fallback path (no AudioContext)
	for(var id in bkcore.Audio.sounds)
	{
		var s = bkcore.Audio.sounds[id];
		if(s == null) continue;
		if(s.gainNode != null) s.gainNode.gain.value = muted ? 0 : 1;
		else if(s.muted != null) s.muted = muted;
	}
};

bkcore.Audio.init();

bkcore.Audio.addSound = function(src, id, loop, callback, usePanner){
	var ctx = bkcore.Audio._ctx;
	var audio = new Audio();
	
	if(ctx){
		var audio = { src: null, gainNode: null, bufferNode: null, loop: loop };
		var xhr = new XMLHttpRequest();
		xhr.responseType = 'arraybuffer';

		xhr.onload = function(){
			ctx.decodeAudioData(xhr.response, function(b){
				// Create Gain Node
				var gainNode = ctx.createGain();

				if(usePanner === true){
					gainNode.connect(bkcore.Audio._panner);
				}
				else {
					gainNode.connect(bkcore.Audio._masterGain);
				}

				// Add the audio source
				audio.src = b;

				//Remember the gain node
				audio.gainNode = gainNode;
				
				callback();
			}, function(e){
				console.error('Audio decode failed!', e);
			});
		};

		xhr.open('GET', src, true);
		xhr.send(null);
	}
	else {
		// Workaround for old Safari
		audio.addEventListener('canplay', function(){
			audio.pause();
			audio.currentTime = 0;

			callback();
		}, false);

		audio.autoplay = true;
		audio.loop = loop;
		audio.src = src;
	}
	
	bkcore.Audio.sounds[id] = audio;
};

bkcore.Audio.play = function(id){
	var ctx = bkcore.Audio._ctx;

	if(ctx){
		var sound = ctx.createBufferSource();
		sound.connect(bkcore.Audio.sounds[id].gainNode);
		
		sound.buffer = bkcore.Audio.sounds[id].src;
		sound.loop = bkcore.Audio.sounds[id].loop;

		bkcore.Audio.sounds[id].gainNode.gain.value = 1;
		bkcore.Audio.sounds[id].bufferNode = sound;

		sound.start ? sound.start(0) : sound.noteOn(0);
	}
	else {
		if(bkcore.Audio.sounds[id].currentTime > 0){
			bkcore.Audio.sounds[id].pause();
			bkcore.Audio.sounds[id].currentTime = 0;
		}

		bkcore.Audio.sounds[id].play();
	}
};

bkcore.Audio.stop = function(id){
	var ctx = bkcore.Audio._ctx;

	if(ctx){
		if(bkcore.Audio.sounds[id].bufferNode !== null){
			var bufferNode = bkcore.Audio.sounds[id].bufferNode;
			bufferNode.stop ? bufferNode.stop(ctx.currentTime) : bufferNode.noteOff(ctx.currentTime);
		}
	}
	else {
		bkcore.Audio.sounds[id].pause();
		bkcore.Audio.sounds[id].currentTime = 0;
	}
};

bkcore.Audio.volume = function(id, volume){
	var ctx = bkcore.Audio._ctx;

	if(ctx){
		bkcore.Audio.sounds[id].gainNode.gain.value = volume;
	}
	else {
		bkcore.Audio.sounds[id].volume = volume;
	}
};

bkcore.Audio.setListenerPos = function(vec){
	if(bkcore.Audio._ctx){
		var panner = bkcore.Audio._panner;
		var vec2 = vec.normalize();
		panner.setPosition(
			vec2.x * bkcore.Audio.posMultipler,
			vec2.y * bkcore.Audio.posMultipler,
			vec2.z * bkcore.Audio.posMultipler
		);
	}
};

bkcore.Audio.setListenerVelocity = function(vec){
	if(bkcore.Audio._ctx){
		var panner = bkcore.Audio._panner;
		//panner.setVelocity(vec.x, vec.y, vec.z);
	}
};

// Browsers keep a freshly created AudioContext suspended until a user gesture;
// call this from the first click/tap/keypress to actually start audio.
bkcore.Audio.resume = function(){
	if(bkcore.Audio._ctx != null && typeof bkcore.Audio._ctx.resume === 'function' && bkcore.Audio._ctx.state === 'suspended')
	{
		var p = bkcore.Audio._ctx.resume();
		if(p != null && typeof p.catch === 'function') p.catch(function(){});
	}
};