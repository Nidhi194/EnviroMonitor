import urllib.request
url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.7041&longitude=77.1025&hourly=pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide&timezone=auto'
with urllib.request.urlopen(url, timeout=10) as r:
    print(r.status)
    data = r.read(1200).decode('utf-8')
    print(data)
