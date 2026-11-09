import os, sys, subprocess, time, multiprocessing as mp
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'build'))
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
OUT = os.path.join(HERE, '..', 'out', 'nexus_8minutes_1080x1920.mp4')
MIX = os.path.join(HERE, '..', 'out', 'mix2.wav')
TOTAL = 1182

def worker(i):
    import shots2
    return shots2.render_frame(i / 30.0).tobytes()

def main():
    cmd = [FF, '-hide_banner', '-loglevel', 'error', '-y',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1080x1920', '-r', '30', '-i', 'pipe:0',
           '-i', MIX, '-map', '0:v', '-map', '1:a',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high',
           '-pix_fmt', 'yuv420p', '-g', '60', '-bf', '2',
           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
           '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
           '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
           '-movflags', '+faststart', '-shortest', OUT]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE); t0 = time.time()
    with mp.get_context('fork').Pool(2) as pool:
        for k, b in enumerate(pool.imap(worker, range(TOTAL), chunksize=4)):
            p.stdin.write(b)
            if k % 90 == 0:
                el = time.time() - t0
                print(f'{k}/{TOTAL} {el:.0f}s eta {el/max(1,k)*(TOTAL-k):.0f}s', flush=True)
    p.stdin.close(); p.wait()
    print('DONE', round(time.time() - t0), 's', round(os.path.getsize(OUT) / 1e6, 1), 'MB')

if __name__ == '__main__':
    main()
