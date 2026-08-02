/*
 * HexGL
 * @author Thibaut 'BKcore' Despoulain <http://bkcore.com>
 * @license This work is licensed under the Creative Commons Attribution-NonCommercial 3.0 Unported License.
 *          To view a copy of this license, visit http://creativecommons.org/licenses/by-nc/3.0/.
 *
 * Demo / attract layer for the custom shell:
 *  - AIDemo.generateRacingLine: walks the collision analyser and extracts the
 *    road centreline as world-space waypoints (resolution independent — the
 *    analyser maps work at 2048px or 512px, ratio = pixels.width / 6000).
 *  - AIDemo.Autopilot: drives a real ShipControls through its key.* state so
 *    the physics (collision, height, boosters) behave exactly like a player.
 *  - AIDemo.AIRacer: kinematic, visible opponents that follow the same line
 *    with their own lane offset / speed, height-matched to the track.
 */

var bkcore = bkcore || {};
bkcore.hexgl = bkcore.hexgl || {};

bkcore.hexgl.AIDemo = {

	// World span the analyser maps cover (matches ShipControls.mapWorldWidth).
	mapWorldWidth: 6000.0,

	// Step along the track, in world units, between generated waypoints.
	stepWorld: 12.0,

	// Extract the road centreline from the collision analyser using a distance
	// transform: every road pixel gets its distance to the nearest wall, and the
	// walk stays on the medial axis (max-distance point along the perpendicular),
	// which is robust to corners and road-width changes on the 512px maps.
	// Returns { points: [{x,z}, ...], mapWidth, spacing } or null when the
	// analyser is not loaded yet / no road found.
	generateRacingLine: function(analyser, spawn)
	{
		if(analyser == null || !analyser.loaded || analyser.pixels == null) return null;

		var w = analyser.pixels.width;
		var h = analyser.pixels.height;
		var self = this;

		// Normalise the analyser into a fixed ~512px working mask so the walk
		// behaves identically at every quality tier:
		//  - 2048px source: 4x4 max-pool of exact road (r == 255). Pooling keeps
		//    the engine's exact road semantics and drops the anti-aliased 200..254
		//    specks that phantom-connect parallel lanes at full res.
		//  - 512px source (textures.low): LANCZOS downscale already blended the
		//    road edges, so use r >= 200 to keep the full-width tarmac.
		// The walk then runs on mw x mh (512) regardless of the loaded map size.
		var mw = 512, mh = 512;
		var roadMask = new Uint8Array(mw * mh);
		var pool = 1;
		if(w > 640) pool = Math.round(w / mw); // 4 at 2048

		if(pool > 1)
		{
			// Max-pool: cell is road if ANY source pixel in the block is road.
			for(var mz = 0; mz < mh; mz++)
			{
				for(var mx = 0; mx < mw; mx++)
				{
					var hit = false;
					var x0 = mx * pool, z0 = mz * pool;
					outer:
					for(var dz = 0; dz < pool; dz++)
					{
						for(var dx = 0; dx < pool; dx++)
						{
							if(analyser.getPixel(x0 + dx, z0 + dz).r >= 255) { hit = true; break outer; }
						}
					}
					roadMask[mz * mw + mx] = hit ? 1 : 0;
				}
			}
		}
		else
		{
			for(var mz = 0; mz < mh; mz++)
			{
				for(var mx = 0; mx < mw; mx++)
				{
					roadMask[mz * mw + mx] = analyser.getPixel(mx, mz).r >= 200 ? 1 : 0;
				}
			}
		}

		var ratio = mw / this.mapWorldWidth;

		function isRoad(px, pz)
		{
			if(px < 1 || pz < 1 || px >= mw - 1 || pz >= mh - 1) return false;
			return roadMask[pz * mw + px] === 1;
		}

		// World -> mask pixel. Ship local +Z is forward; spawnRotation is (0,0,0)
		// so the initial heading is world +Z (same convention as ShipControls).
		var x = Math.round(mw / 2 + spawn.x * ratio);
		var z = Math.round(mh / 2 + spawn.z * ratio);

		if(!isRoad(x, z))
		{
			// Spawn should be on the start line, but be defensive: spiral out to
			// the nearest road pixel so the walk always starts on tarmac.
			var found = false;
			for(var r = 1; r < 80 && !found; r++)
			{
				for(var a = 0; a < 8; a++)
				{
					var sx = Math.round(x + Math.cos(a * Math.PI / 4) * r);
					var sz = Math.round(z + Math.sin(a * Math.PI / 4) * r);
					if(isRoad(sx, sz)) { x = sx; z = sz; found = true; break; }
				}
			}
			if(!found) return null;
		}

		// --- Distance transform (8-neighbour chamfer, units = 1/3 px) over the
		// road mask. Walls (non-road) keep dist 0 so edge pixels measure their
		// distance to the wall; unprocessed road pixels stay INF and are skipped.
		var dist = new Uint16Array(mw * mh);
		var INF = 65535;
		for(var py = 0; py < mh; py++)
		{
			for(var px = 0; px < mw; px++)
			{
				if(roadMask[py * mw + px] === 1) dist[py * mw + px] = INF;
			}
		}

		function chamferNeighbours(px, py, fwd, out)
		{
			var k = 0;
			if(fwd)
			{
				// already-processed neighbourhood (top-left region)
				if(py > 0 && px > 0) { out[k++] = [-1, -1, 4]; }
				if(py > 0) { out[k++] = [-1, 0, 3]; }
				if(py > 0 && px < mw - 1) { out[k++] = [-1, 1, 4]; }
				if(px > 0) { out[k++] = [0, -1, 3]; }
			}
			else
			{
				if(py < mh - 1 && px < mw - 1) { out[k++] = [1, 1, 4]; }
				if(py < mh - 1) { out[k++] = [1, 0, 3]; }
				if(py < mh - 1 && px > 0) { out[k++] = [1, -1, 4]; }
				if(px < mw - 1) { out[k++] = [0, 1, 3]; }
			}
			return k;
		}

		var nb = [null, null, null, null];
		// Forward pass (top-left -> bottom-right).
		for(var py = 0; py < h; py++)
		{
			for(var px = 0; px < w; px++)
			{
				var idx = py * mw + px;
				if(!roadMask[idx]) continue;
				var best = INF;
				var k = chamferNeighbours(px, py, true, nb);
				for(var n = 0; n < k; n++)
				{
					var dv = dist[(py + nb[n][0]) * mw + (px + nb[n][1])];
					if(dv >= INF) continue;
					var v = dv + nb[n][2];
					if(v < best) best = v;
				}
				dist[idx] = best;
			}
		}
		// Backward pass (bottom-right -> top-left).
		for(var py = mh - 1; py >= 0; py--)
		{
			for(var px = mw - 1; px >= 0; px--)
			{
				var idx = py * mw + px;
				if(!roadMask[idx]) continue;
				var best = dist[idx];
				var k = chamferNeighbours(px, py, false, nb);
				for(var n = 0; n < k; n++)
				{
					var dv = dist[(py + nb[n][0]) * mw + (px + nb[n][1])];
					if(dv >= INF) continue;
					var v = dv + nb[n][2];
					if(v < best) best = v;
				}
				dist[idx] = best;
			}
		}

		function dAt(px, pz)
		{
			if(px < 0 || pz < 0 || px >= mw || pz >= mh) return 0;
			return dist[pz * mw + px];
		}

		// --- Walk the medial axis ---
		var hx = 0, hz = 1; // heading
		var step = Math.max(2, Math.round(ratio * self.stepWorld));
		var spacing = step / ratio; // actual world units between waypoints
		var points = [];
		var travelledWorld = 0;
		var maxSteps = 9000;
		var startX = x, startZ = z;
		var closed = false;

		for(var i = 0; i < maxSteps; i++)
		{
			// 1) Re-centre: find the road cross-section through the current point
			//    (scan perpendicular until walls), then pick the max-distance
			//    (medial) pixel within that segment only. Bounding by the road
			//    segment is essential: the map has parallel track sections close
			//    together, and an unbounded max-DT search pulls the walk onto
			//    neighbouring lanes.
			var nx = -hz, nz = hx;
			var leftEdge = 0;
			for(var s = 1; s <= 240; s++)
			{
				if(!isRoad(Math.round(x + nx * s), Math.round(z + nz * s))) break;
				leftEdge = s;
			}
			var rightEdge = 0;
			for(var s = 1; s <= 240; s++)
			{
				if(!isRoad(Math.round(x - nx * s), Math.round(z - nz * s))) break;
				rightEdge = s;
			}
			if(leftEdge + rightEdge < 3)
			{
				// Off-road / degenerate (tight corners on the small 512px maps):
				// spiral to the nearest road pixel, re-aim the heading at it from
				// the previous centreline point, and let the next pass re-centre.
				var rx = -1, rz = -1;
				for(var rr = 1; rr <= 60 && rx < 0; rr++)
				{
					for(var aa = 0; aa < 8; aa++)
					{
						var cxx = Math.round(x + Math.cos(aa * Math.PI / 4) * rr);
						var czz = Math.round(z + Math.sin(aa * Math.PI / 4) * rr);
						if(isRoad(cxx, czz)) { rx = cxx; rz = czz; break; }
					}
				}
				if(rx < 0) break; // nowhere to go
				if(points.length > 0)
				{
					var lp = points[points.length - 1];
					var lpx = Math.round(mw / 2 + lp.x * ratio), lpz = Math.round(mh / 2 + lp.z * ratio);
					var ddx = rx - lpx, ddz = rz - lpz;
					var dl = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
					hx = ddx / dl;
					hz = ddz / dl;
				}
				x = rx;
				z = rz;
				continue;
			}
			var bx = x, bz = z, bd = -1;
			for(var s = -rightEdge; s <= leftEdge; s++)
			{
				var tx = Math.round(x + nx * s), tz = Math.round(z + nz * s);
				var dv = dAt(tx, tz);
				if(dv > bd) { bd = dv; bx = tx; bz = tz; }
			}
			x = bx;
			z = bz;

			// 2) Record the waypoint in world units.
			points.push({ x: (x - mw / 2) / ratio, z: (z - mh / 2) / ratio });

			// 3) Advance along the heading; if the road bends away, fan-scan for
			//    the nearest road-bearing direction (handles hairpins).
			if(!isRoad(Math.round(x + hx * step), Math.round(z + hz * step)))
			{
				var found = false;
				for(var a = 1; a <= 36 && !found; a++)
				{
					var ang = a * 0.06;
					var c = Math.cos(ang), si = Math.sin(ang);
					var cand = [
						[ hx * c - hz * si, hx * si + hz * c ],
						[ hx * c + hz * si, -hx * si + hz * c ]
					];
					for(var d = 0; d < 2 && !found; d++)
					{
						if(isRoad(Math.round(x + cand[d][0] * step), Math.round(z + cand[d][1] * step)))
						{
							hx = cand[d][0];
							hz = cand[d][1];
							found = true;
						}
					}
				}
				if(!found) break; // dead end (should not happen on a closed loop)
			}

			x += hx * step;
			z += hz * step;
			travelledWorld += spacing;

			// 4) Loop closure: the centreline only crosses the start pixel on the
			//    start line, so the first close approach after a safe minimum is a
			//    completed lap. Thresholds are in world units / px so both the 512px
			//    and 2048px analyser sizes close on the first lap.
			if(travelledWorld > 4500)
			{
				var dx = x - startX, dz = z - startZ;
				if(dx * dx + dz * dz < step * step * 36)
				{
					closed = true;
					break;
				}
			}
		}

		if(points.length < 60 || !closed) return null;

		// --- Uniform resampling ---
		// The DT re-centre makes consecutive walk points uneven; resample the
		// closed polyline at a constant arc-length so lookahead (in points) and
		// the racers' arc advance both behave identically at any resolution.
		var n2 = points.length;
		var cum = new Array(n2);
		cum[0] = 0;
		for(var i2 = 1; i2 < n2; i2++)
		{
			var ddX = points[i2].x - points[i2 - 1].x;
			var ddZ = points[i2].z - points[i2 - 1].z;
			cum[i2] = cum[i2 - 1] + Math.sqrt(ddX * ddX + ddZ * ddZ);
		}
		var closingLen = Math.sqrt(
			Math.pow(points[0].x - points[n2 - 1].x, 2) +
			Math.pow(points[0].z - points[n2 - 1].z, 2)
		);
		var total = cum[n2 - 1] + closingLen;
		var resampleCount = Math.max(60, Math.round(total / self.stepWorld));
		var sampled = [];
		var seg = 0;
		for(var s = 0; s < resampleCount; s++)
		{
			var a = (s * total) / resampleCount;
			while(seg < n2 - 1 && cum[seg + 1] < a) seg++;
			var p0, p1, segStart, segLen;
			if(seg < n2 - 1)
			{
				p0 = points[seg]; p1 = points[seg + 1]; segStart = cum[seg]; segLen = cum[seg + 1] - cum[seg];
			}
			else
			{
				p0 = points[n2 - 1]; p1 = points[0]; segStart = cum[n2 - 1]; segLen = closingLen;
			}
			var t = segLen > 0 ? (a - segStart) / segLen : 0;
			var sx = p0.x + (p1.x - p0.x) * t;
			var sz = p0.z + (p1.z - p0.z) * t;
			// Snap any point that drifted off-road (sharp corner chords).
			var spx = Math.round(mw / 2 + sx * ratio);
			var spz = Math.round(mh / 2 + sz * ratio);
			if(!isRoad(spx, spz))
			{
				var snapped = false;
				for(var rr = 1; rr <= 40 && !snapped; rr++)
				{
					for(var aa = 0; aa < 8; aa++)
					{
						var cxx = Math.round(spx + Math.cos(aa * Math.PI / 4) * rr);
						var czz = Math.round(spz + Math.sin(aa * Math.PI / 4) * rr);
						if(isRoad(cxx, czz))
						{
							sx = (cxx - mw / 2) / ratio;
							sz = (czz - mh / 2) / ratio;
							snapped = true;
						}
					}
				}
			}
			sampled.push({ x: sx, z: sz });
		}

		return {
			points: sampled,
			spacing: total / resampleCount,
			mapWidth: mw,
			mapHeight: mh
		};
	},

	// Build the demo grid of visible AI racers. Returns an array of AIRacer.
	createRacers: function(hex, line)
	{
		var geometry = hex.track.lib.get("geometries", "ship.feisar");
		var scene = hex.manager.get("game").scene;
		var controls = hex.components.shipControls;

		var specs = [
			{ color: 0xff5566, lane: -24, speed: 330, start: 90 },   // red, inside lane
			{ color: 0xffb454, lane: 22,  speed: 305, start: 210 },  // orange, outside lane
			{ color: 0x9dff57, lane: -6,  speed: 345, start: 340 }   // green, tailgating the hero
		];

		var racers = [];
		for(var i = 0; i < specs.length; i++)
		{
			racers.push(new bkcore.hexgl.AIDemo.AIRacer(hex, scene, geometry, line, controls, specs[i]));
		}
		return racers;
	}
};

// Autopilot: drives a ShipControls via key.* so the demo hero uses real physics.
bkcore.hexgl.AIDemo.Autopilot = function(shipControls, line)
{		this.controls = shipControls;
		this.line = line;
		this._ready = line != null && line.points != null && line.points.length > 60;
		this.engaged = true;
		this.dead = 0.05;       // steering dead zone, radians
		this.corner = 0.42;     // brake when the lead angle exceeds this, radians
		// Lookahead in world units (converted to waypoint steps per frame so
		// behaviour is identical at 512px and 2048px analyser resolutions).
		this.lookaheadMin = 300; // at low speed
		this.lookaheadMax = 840; // at full speed
	this._fwd = new THREE.Vector3(0, 0, 1);
	this._des = new THREE.Vector3();
};

bkcore.hexgl.AIDemo.Autopilot.prototype.disengage = function()
{
	this.engaged = false;
	var k = this.controls.key;
	if(k) { k.forward = false; k.left = false; k.right = false; k.brake = false; k.ltrigger = false; k.rtrigger = false; }
};

bkcore.hexgl.AIDemo.Autopilot.prototype.update = function(delta)
{
	var controls = this.controls;
	if(!this.engaged) return;

	// Hold position until the racing line is ready (analyser not loaded).
	if(!this._ready)
	{
		controls.key.forward = false;
		controls.key.left = false;
		controls.key.right = false;
		controls.key.brake = false;
		return;
	}

	var pos = controls.dummy.position;
	var pts = this.line.points;
	var n = pts.length;

	// Nearest waypoint (full scan: robust to resets, crashes and replays).
	var best = 0, bestD = Infinity;
	for(var i = 0; i < n; i++)
	{
		var dx = pts[i].x - pos.x;
		var dz = pts[i].z - pos.z;
		var d = dx * dx + dz * dz;
		if(d < bestD) { bestD = d; best = i; }
	}		// Adaptive lookahead: shorter when slow (tighter cornering).
		var speedRatio = Math.max(0, Math.min(1, controls.getSpeedRatio ? controls.getSpeedRatio() : 1));
		var lookahead = Math.max(1, Math.round((this.lookaheadMin + (this.lookaheadMax - this.lookaheadMin) * speedRatio) / this.line.spacing));
		var target = pts[(best + lookahead) % n];

	// Ship world forward (local +Z rotated by the dummy matrix).
	this._fwd.set(0, 0, 1);
	controls.dummy.matrix.rotateAxis(this._fwd);

	this._des.set(target.x - pos.x, 0, target.z - pos.z);
	var len = Math.sqrt(this._des.x * this._des.x + this._des.z * this._des.z);
	if(len < 0.001) return;
	this._des.x /= len;
	this._des.z /= len;

	// Signed lead angle between forward and the lookahead direction.
	// Positive = steer left, matching the game's key mapping (left key ->
	// positive rotation.y). cross = fwd x des; steer = -atan2(cross, dot).
	var cross = this._fwd.x * this._des.z - this._fwd.z * this._des.x;
	var dot = this._fwd.x * this._des.x + this._fwd.z * this._des.z;
	var steer = -Math.atan2(cross, dot);

	controls.key.forward = true;
	controls.key.brake = Math.abs(steer) > this.corner;
	controls.key.left = steer > this.dead;
	controls.key.right = steer < -this.dead;
	controls.key.ltrigger = false;
	controls.key.rtrigger = false;
};

// Kinematic, visible AI racer following the racing line.
bkcore.hexgl.AIDemo.AIRacer = function(hex, scene, geometry, line, controls, opts)
{
	this.line = line;
	this.controls = controls;
	this.speed = opts.speed;       // world units / second
	this.lane = opts.lane;         // lateral offset from the centreline, world units
	this.progress = opts.start;    // float waypoint index (fraction = interpolation t)
	this.spacing = line.spacing || 12;

	this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
		color: opts.color,
		ambient: 0x444444
	}));
	this.mesh.visible = false;
	scene.add(this.mesh);

	// Engine-glow sprite at the tail, tinted to the racer colour.
	if(hex != null && hex.track != null && hex.track.lib != null)
	{
		var spriteTex = hex.track.lib.get("textures", "booster.sprite");
		if(spriteTex)
		{
			this.booster = new THREE.Sprite({
				map: spriteTex,
				blending: THREE.AdditiveBlending,
				useScreenCoordinates: false,
				color: opts.color
			});
			this.booster.scale.set(0.02, 0.02, 0.02);
			this.booster.mergeWith3D = false;
			this.booster.position.set(0, 0.665, -3.8);
			this.mesh.add(this.booster);
		}
	}

	this.heightMap = controls.heightMap || null;
	this.heightScale = controls.heightScale || 10.0;
	this.heightBias = controls.heightBias || 4.0;
	this._heightRatio = 0;
	this._ratioSynced = false;
	this._y = 0;
};

bkcore.hexgl.AIDemo.AIRacer.prototype.update = function(delta)
{
	var pts = this.line.points;
	var n = pts.length;
	var dt = Math.max(0, (Number(delta) || 16.6)) / 1000; // seconds

	this.progress += this.speed * dt / this.spacing;
	if(this.progress >= n) this.progress %= n;
	if(this.progress < 0) this.progress = (this.progress % n) + n;

	var i0 = Math.floor(this.progress);
	var t = this.progress - i0;
	var i1 = (i0 + 1) % n;
	var p0 = pts[i0], p1 = pts[i1];

	var dx = p1.x - p0.x, dz = p1.z - p0.z;
	var dl = Math.sqrt(dx * dx + dz * dz) || 1;
	var nx = -dz / dl, nz = dx / dl; // perpendicular (lane offset)

	var cx = p0.x + dx * t; // centreline point (height is sampled here — the
	var cz = p0.z + dz * t; // height map has sharp near-road gradients, so the
	                        // lateral lane offset must not move the sample).
	var px = cx + nx * this.lane;
	var pz = cz + nz * this.lane;

	// Height: mirror ShipControls.heightCheck (same map, ratio and formula) so
	// the racers ride the actual track surface.
	var y = this._y;
	if(this.heightMap != null && this.heightMap.loaded)
	{
		if(!this._ratioSynced)
		{
			this._heightRatio = this.heightMap.pixels.width / 6000.0;
			this._ratioSynced = true;
		}
		var hx = this.heightMap.pixels.width / 2 + cx * this._heightRatio;
		var hz = this.heightMap.pixels.height / 2 + cz * this._heightRatio;
		var hv = this.heightMap.getPixelFBilinear(hx, hz);
		var h = hv / this.heightScale + this.heightBias;
		if(h < 16777) y = h;
	}
	this._y += (y - this._y) * 0.35;

	var m = this.mesh;
	m.position.set(px, this._y, pz);
	m.rotation.set(0, Math.atan2(dx, dz), 0);
	m.visible = true;
	m.updateMatrixWorld(true);
};

bkcore.hexgl.AIDemo.AIRacer.prototype.destroy = function()
{
	if(this.mesh.parent != null) this.mesh.parent.remove(this.mesh);
};
