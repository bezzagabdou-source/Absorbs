# -*- coding: utf-8 -*-
FPS, SR, END, FILM_END = 30, 48000, 39.60, 35.55
# (clip, seg, at, role)  — anchored on the actual detected speech onsets
VO = [
 ("01", 0, 1.00, "dot"), ("01", 1, 4.62, "earth"), ("01", 2, 5.75, "earth"),
 ("01", 3, 7.30, "earth"), ("01", 4, 8.69, "earth"), ("01", 5, 10.76, "vanish"),
 ("02", 0, 13.00, "sun"), ("02", 1, 14.98, "sun"), ("02", 2, 17.95, "stars"),
 ("02", 3, 18.95, "stars"), ("03", 0, 22.35, "galaxy"), ("03", 1, 23.55, "galaxy"),
 ("04", 0, 27.15, "many"), ("04", 1, 28.70, "dot2"),
 ("05", 0, 30.40, "finale"), ("05", 1, 31.80, "finale"), ("05", 2, 33.35, "finale"),
]
CUT = dict(dot=0.00, earth=4.62, vanish=11.30, sun=12.55, stars=17.55,
           galaxy=21.75, many=25.40, dot2=27.85, finale=29.95, endcard=35.55)
