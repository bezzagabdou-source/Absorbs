extends Node
## Music player with crossfade, one-shot SFX pool (spatial optional) and a
## continuous engine synthesis voice driven by RPM.

const SFX_DIR := "res://assets/audio/sfx/"
const MUSIC_DIR := "res://assets/audio/music/"
const SFX_NAMES := ["ui_click", "ui_hover", "ui_confirm", "ui_back", "nitro", "crash", "gear_shift",
	"purchase", "level_up", "achievement", "countdown_beep", "countdown_go", "tyre_screech", "wind"]

var _sfx: Dictionary = {}
var _music_streams: Dictionary = {}
var _music_a: AudioStreamPlayer
var _music_b: AudioStreamPlayer
var _active_music = "a"
var _current_track = ""
var _pool: Array[AudioStreamPlayer] = []
var _pool_index = 0
var engine_player: AudioStreamPlayer
var screech_player: AudioStreamPlayer
var wind_player: AudioStreamPlayer

const POOL_SIZE := 10


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for n in SFX_NAMES:
		var path = SFX_DIR + n + ".ogg"
		if ResourceLoader.exists(path):
			_sfx[n] = load(path)
	for track in ["menu_theme", "race_theme", "garage_theme", "results_theme"]:
		var p = MUSIC_DIR + track + ".ogg"
		if ResourceLoader.exists(p):
			var st: AudioStreamOggVorbis = load(p)
			st.loop = true
			_music_streams[track] = st
	_music_a = _make_music_player()
	_music_b = _make_music_player()
	for i in range(POOL_SIZE):
		var p = AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_pool.append(p)
	engine_player = _make_loop_player("engine_loop", "Engine", 6.5)
	screech_player = _make_loop_player("tyre_screech", "SFX", 3.5)
	wind_player = _make_loop_player("wind", "Ambience", 2.0)


func _make_music_player() -> AudioStreamPlayer:
	var p = AudioStreamPlayer.new()
	p.bus = "Music"
	p.volume_db = -12.0
	add_child(p)
	return p


func _make_loop_player(sfx_name: String, bus: String, vol: float) -> AudioStreamPlayer:
	var p = AudioStreamPlayer.new()
	p.bus = bus
	p.volume_db = vol
	if _sfx.has(sfx_name):
		p.stream = _sfx[sfx_name]
	add_child(p)
	return p


func play_sfx(sfx_name: String, volume_db: float = 0.0, pitch: float = 1.0) -> void:
	if not _sfx.has(sfx_name):
		return
	var p: AudioStreamPlayer = _pool[_pool_index]
	_pool_index = (_pool_index + 1) % _pool.size()
	p.stream = _sfx[sfx_name]
	p.volume_db = volume_db
	p.pitch_scale = clampf(pitch, 0.5, 2.0)
	p.play()


func play_music(track: String, fade: float = 1.2, volume_db: float = -8.0) -> void:
	if track == _current_track:
		return
	if not _music_streams.has(track):
		return
	_current_track = track
	var out_player: AudioStreamPlayer = _music_a if _active_music == "a" else _music_b
	var in_player: AudioStreamPlayer = _music_b if _active_music == "a" else _music_a
	_active_music = "b" if _active_music == "a" else "a"
	in_player.stream = _music_streams[track]
	in_player.volume_db = -40.0
	in_player.play()
	var tw = create_tween()
	tw.set_parallel(true)
	tw.tween_property(in_player, "volume_db", volume_db, fade).set_ease(Tween.EASE_OUT)
	tw.tween_property(out_player, "volume_db", -40.0, fade * 0.8).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(out_player.stop)


func stop_music(fade: float = 0.8) -> void:
	_current_track = ""
	var tw = create_tween()
	tw.set_parallel(true)
	tw.tween_property(_music_a, "volume_db", -40.0, fade)
	tw.tween_property(_music_b, "volume_db", -40.0, fade)
	tw.chain().tween_callback(func():
		_music_a.stop()
		_music_b.stop())


## Engine voice: rpm 0..1 maps to pitch 0.55..1.9 and loudness follows throttle.
func set_engine(rpm_ratio: float, load: float, running: bool = true) -> void:
	if engine_player == null:
		return
	if not engine_player.playing and running:
		engine_player.play()
	engine_player.pitch_scale = lerpf(0.55, 2.05, clampf(rpm_ratio, 0.0, 1.0))
	engine_player.volume_db = lerpf(-26.0, 1.0, clampf(load, 0.0, 1.0))


func set_screech(intensity: float) -> void:
	if screech_player == null:
		return
	if intensity > 0.05:
		if not screech_player.playing:
			screech_player.play()
		screech_player.volume_db = lerpf(-24.0, -6.0, clampf(intensity, 0.0, 1.0))
		screech_player.pitch_scale = lerpf(0.85, 1.2, clampf(intensity, 0.0, 1.0))
	elif screech_player.playing:
		screech_player.stop()


func set_wind(intensity: float) -> void:
	if wind_player == null:
		return
	if intensity > 0.05:
		if not wind_player.playing:
			wind_player.play()
		wind_player.volume_db = lerpf(-30.0, -6.0, clampf(intensity, 0.0, 1.0))
	elif wind_player.playing:
		wind_player.stop()


func stop_race_audio() -> void:
	if engine_player:
		engine_player.stop()
	if screech_player:
		screech_player.stop()
	if wind_player:
		wind_player.stop()
