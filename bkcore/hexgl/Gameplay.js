 /*
 * HexGL
 * @author Thibaut 'BKcore' Despoulain <http://bkcore.com>
 * @license This work is licensed under the Creative Commons Attribution-NonCommercial 3.0 Unported License. 
 *          To view a copy of this license, visit http://creativecommons.org/licenses/by-nc/3.0/.
 */

var bkcore = bkcore || {};
bkcore.hexgl = bkcore.hexgl || {};

bkcore.hexgl.Gameplay = function(opts)
{
	var self = this;

	this.startDelay = 0;
	this.countDownDelay = 1000;

	this.active = false;
	this.timer = new bkcore.Timer();
	this.modes = {
		'timeattack':null,
		'survival':null,
		'replay':null
	};
	this.mode = opts.mode == undefined || !(opts.mode in this.modes) ? "timeattack" : opts.mode;
	this.step = 0;

	this.hud = opts.hud;
	this.shipControls = opts.shipControls;
	this.cameraControls = opts.cameraControls;
	this.track = opts.track;
	this.analyser = opts.analyser;
	this.pixelRatio = opts.pixelRatio;
	this._ratioSynced = false;

	this.previousCheckPoint = -1;
	this.wrongWay = false;

	this.results = {
		FINISH: 1,
		DESTROYED: 2,
		WRONGWAY: 3,
		REPLAY: 4,
		NONE: -1
	};
	this.result = this.results.NONE;

	this.lap = 1;
	this.lapTimes = [];
	this.lapTimeElapsed = 0;
	this.currentLapTime = 0;
	this.sessionBest = null;
	this.lapTrace = [];
	this.completedLapTraces = [];
	this.traceInterval = 1000 / 15;
	this.nextTraceAt = 0;
	this.previousPosition = new THREE.Vector3();
	this.hasPreviousPosition = false;
	this.maxLaps = 3;
	this.score = null;
	this.finishTime = null;
	this.onFinish = opts.onFinish == undefined ? function(){console.log("FINISH");} : opts.onFinish;
	this.onLapComplete = opts.onLapComplete == undefined ? function(){} : opts.onLapComplete;

	this.raceData = null;

	this.modes.timeattack = function()
	{
		self.raceData.tick(this.timer.time.elapsed);

		self.currentLapTime = self.timer.time.elapsed - self.lapTimeElapsed;
		self.recordLapSample(self.currentLapTime);
		self.hud != null && self.hud.updateLapTime(self.currentLapTime, self.sessionBest);
		var cp = self.checkPoint();

		if(cp == self.track.checkpoints.start && self.previousCheckPoint == self.track.checkpoints.last)
		{
			self.previousCheckPoint = cp;
			self.setWrongWay(false);
			var t = self.timer.time.elapsed;
			var completedLapTime = t - self.lapTimeElapsed;
			self.currentLapTime = completedLapTime;
			self.lapTimes.push(completedLapTime);
			if(self.sessionBest == null || completedLapTime < self.sessionBest)
				self.sessionBest = completedLapTime;
			self.completedLapTraces.push(self.lapTrace.slice(0));
			self.onLapComplete({
				lap: self.lap,
				time: completedLapTime,
				trace: self.lapTrace.slice(0),
				lapTimes: self.lapTimes.slice(0),
				sessionBest: self.sessionBest
			});
			self.lapTimeElapsed = t;
			self.lapTrace = [];
			self.nextTraceAt = 0;

			if(self.lap == this.maxLaps)
			{
				self.end(self.results.FINISH);
			}
			else
			{
				self.lap++;
				self.currentLapTime = 0;
				self.hud != null && self.hud.updateLap(self.lap, self.maxLaps);

				if(self.lap == self.maxLaps)
					self.hud != null && self.hud.display("Final lap", 0.5);
			}
		}
		else if(cp != -1 && cp != self.previousCheckPoint)
		{
			// WRONG WAY detection: a checkpoint crossed in reverse order means
			// we're driving against the track direction (e.g. 1 -> 0 instead of
			// 0 -> 1). Lap crossings (last -> start) are the forward case.
			var count = self.track.checkpoints.list.length;
			if(self.previousCheckPoint >= 0 && cp === (self.previousCheckPoint + count - 1) % count)
				self.setWrongWay(true);
			else if(self.previousCheckPoint >= 0 && cp === (self.previousCheckPoint + 1) % count)
				self.setWrongWay(false);
			self.previousCheckPoint = cp;
		}

		if(self.shipControls.destroyed == true)
		{
			self.end(self.results.DESTROYED);
		}
	};

	this.modes.replay = function()
	{
		self.raceData.applyInterpolated(this.timer.time.elapsed);

		if(self.raceData.seek == self.raceData.last)
		{
			self.end(self.results.REPLAY);
		}
	};
}

bkcore.hexgl.Gameplay.prototype.simu = function()
{
	this.lapTimes = [92300, 91250, 90365];
	this.finishTime = this.lapTimes[0]+this.lapTimes[1]+this.lapTimes[2];
	if(this.hud != null) this.hud.display("Finish");
	this.step = 100;
	this.result = this.results.FINISH;
	this.shipControls.active = false;
}

bkcore.hexgl.Gameplay.prototype.start = function(opts)
{
	this.finishTime = null;
	this.score = null;
	this.lap = 1;
	this.lapTimes = [];
	this.lapTimeElapsed = 0;
	this.currentLapTime = 0;
	this.sessionBest = null;
	this.lapTrace = [];
	this.completedLapTraces = [];
	this.nextTraceAt = 0;
	this.hasPreviousPosition = false;

	this.shipControls.reset(this.track.spawn, this.track.spawnRotation);
	this.shipControls.active = false;

	this.previousCheckPoint = this.track.checkpoints.start;
	this.wrongWay = false;
	if(window.dispatchEvent) window.dispatchEvent(new CustomEvent('hexgl:wrongway', { detail: { wrong: false } }));

	this.raceData = new bkcore.hexgl.RaceData(this.track.name, this.mode, this.shipControls);
	if(this.mode == 'replay')
	{
		this.cameraControls.mode = this.cameraControls.modes.ORBIT;
		if(this.hud != null) this.hud.messageOnly = true;

		try {
			var d = localStorage['race-'+this.track.name+'-replay'];
			if(d == undefined)
			{
				console.error('No replay data for '+'race-'+this.track.name+'-replay'+'.');
				return false;
			}
			this.raceData.import(
				JSON.parse(d)
			);
			if(this.raceData.last < 0)
			{
				console.error('Empty replay data for '+'race-'+this.track.name+'-replay'+'.');
				return false;
			}
		}
		catch(e) { console.error('Bad replay format : '+e); return false; }
	}

	this.active = true;
	this.step = 0;
	this.timer.start();
	if(this.hud != null)
	{
		this.hud.resetTime();
		this.hud.updateLapTime(0, null);
		this.hud.display("3", 0.9);
		this.hud.updateLap(this.lap, this.maxLaps);
	}
}

bkcore.hexgl.Gameplay.prototype.end = function(result)
{
	this.score = this.timer.getElapsedTime();
	this.finishTime = this.timer.time.elapsed;
	this.timer.start();
	this.result = result;

	this.shipControls.active = false;

	if(result == this.results.FINISH)
	{
		if(this.hud != null) this.hud.display("Finish");
		this.step = 100;
	}
	else if(result == this.results.DESTROYED)
	{
		if(this.hud != null) this.hud.display("Destroyed");
		this.step = 100;
	}
	else if(result == this.results.REPLAY)
	{
		if(this.hud != null) this.hud.display("Replay", 0.5);
		this.step = 100;
	}
}

bkcore.hexgl.Gameplay.prototype.update = function()
{
	if(!this.active) return;

	this.timer.update();
	
	if(this.step == 0 && this.timer.time.elapsed >= this.startDelay)
	{
		this.step = 1;
	}
	else if(this.step == 1 && this.timer.time.elapsed >= this.countDownDelay+this.startDelay)
	{
		if(this.hud != null) this.hud.display("2");
		this.step = 2;
	}
	else if(this.step == 2 && this.timer.time.elapsed >= 2*this.countDownDelay+this.startDelay)
	{
		if(this.hud != null) this.hud.display("1");
		this.step = 3;
	}
	else if(this.step == 3 && this.timer.time.elapsed >= 3*this.countDownDelay+this.startDelay)
	{
		if(this.hud != null) this.hud.display("Go", 0.5);
		this.step = 4;
		this.timer.start();
		
		if(this.mode != "replay")
			this.shipControls.active = true;
	}
	else if(this.step == 4)
	{
		this.modes[this.mode].call(this);
	}
	else if(this.step == 100 && this.timer.time.elapsed >= 2000)
	{
		this.active = false;
		this.onFinish.call(this);
	}
}

bkcore.hexgl.Gameplay.prototype.checkPoint = function()
{
	// Analysers load async; sync the ratio to the real map width once.
	if(this.analyser && this.analyser.loaded && this.analyser.pixels && !this._ratioSynced)
	{
		this.pixelRatio = this.analyser.pixels.width / 6000.0;
		this._ratioSynced = true;
	}
	var current = this.shipControls.dummy.position;
	var from = this.hasPreviousPosition ? this.previousPosition : current;
	var dx = current.x - from.x;
	var dz = current.z - from.z;
	var steps = Math.max(1, Math.min(18, Math.ceil(Math.sqrt(dx*dx + dz*dz) * this.pixelRatio * 2)));
	var checkpoint = -1;
	for(var i=0; i<=steps; i++)
	{
		var t = i / steps;
		var x = Math.round(this.analyser.pixels.width/2 + (from.x + dx*t) * this.pixelRatio);
		var z = Math.round(this.analyser.pixels.height/2 + (from.z + dz*t) * this.pixelRatio);
		var color = this.analyser.getPixel(x, z);
		if(color.r == 255 && color.g == 255 && color.b < 250)
		{
			checkpoint = color.b;
			break;
		}
	}
	this.previousPosition.copy(current);
	this.hasPreviousPosition = true;
	return checkpoint;
}

bkcore.hexgl.Gameplay.prototype.setWrongWay = function(wrong)
{
	if(this.wrongWay === wrong) return;
	this.wrongWay = wrong;
	if(window.dispatchEvent) window.dispatchEvent(new CustomEvent('hexgl:wrongway', { detail: { wrong: wrong } }));
};

bkcore.hexgl.Gameplay.prototype.recordLapSample = function(lapTime)
{
	if(lapTime + 0.01 < this.nextTraceAt && this.lapTrace.length > 0) return;
	var p = this.shipControls.getPosition();
	var q = this.shipControls.getQuaternion();
	this.lapTrace.push([
		Math.round(lapTime),
		Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100,
		Math.round(q.x * 10000) / 10000, Math.round(q.y * 10000) / 10000, Math.round(q.z * 10000) / 10000, Math.round(q.w * 10000) / 10000
	]);
	this.nextTraceAt = lapTime + this.traceInterval;
}
