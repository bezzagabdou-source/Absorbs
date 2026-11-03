"""LEGENDARY STUDIO — automatic cinematic montage engine.

Modules:
  ffmpeg   — FFmpeg binary discovery, probing, PCM/scene analysis
  analysis — beat grid + transient/scene snapping → edit decision list
  sfx      — procedural cinematic sound design (numpy)
  render   — FFmpeg filtergraph: upscale, grade, camera, glitch, titles, mix
  demo     — synthetic 9:16 fantasy clip generator
  cli      — command line entry point
"""
__version__ = "1.0.0"
