import csv, json
rows=list(csv.DictReader(open('reviews.csv',encoding='utf-8')))
codes={
 "H_signup":   [0,1,4,5,6,7,14,40],
 "H_perf":     [25,28,31,33,34,35,36,39,100],
 "H_controls": [12,13,80,98,81,10],
 "H_learning": [58,60,92,86,16,52],
 "H_unfinished":[68,73,75,26],
 "H_ai":       [74,9],
 "H_saves":    [55,56,57,62,63],
 "H_ads":      [82],
 "H_polish":   [41,42,33],
 "M_singleplayer":[74,78,79,86,87,88,89,91,94,95,96,59],
 "M_multiplayer":[45,48,2],
 "M_mods":     [82,83,84,85],
 "M_rtsbasics":[10],
 "M_content":  [49],
 "U_solo_slow":[86,92,95,88,74],
 "U_mobile":   [80,82,85,98,32],
 "U_instant":  [0,1,4,5,6,7,14,40,23],
 "counter_signup":[8],
 "positive_addictive":[47,54,61,67,72],
}
out={}
for k,ix in codes.items():
    srcs=sorted({rows[i]['source'] for i in ix}); threads=sorted({rows[i]['url'] for i in ix})
    yrs=sorted({rows[i]['date'][:4] for i in ix if rows[i]['date']})
    out[k]=dict(n=len(ix),sources=srcs,threads=len(threads),years=yrs)
    print(f"{k:20} n={len(ix):2} src={len(srcs)} {srcs} threads={len(threads)} years={yrs}")
json.dump(codes,open('coding.json','w'),indent=1)
