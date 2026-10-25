"""Dati di prova realistici per i test visivi e funzionali."""
import json
import random
from datetime import datetime, timedelta

TRIGGERS = ['Stress', 'Poco sonno', 'Pasto saltato', 'Alcol', 'Cambio del tempo', 'Luci intense / schermi', 'Caffeina', 'Ciclo mestruale']
SYMPTOMS = ['Nausea', 'Sensibilità alla luce', 'Sensibilità ai rumori', 'Stanchezza', 'Vomito', 'Vertigini']
MEDS = [('Sumatriptan', 'triptan'), ('Ibuprofene', 'nsaid'), ('Rizatriptan', 'triptan'), ('Paracetamolo', 'paracetamol')]
TYPES = ['senza_aura', 'senza_aura', 'con_aura', 'tensiva']


def fmt(d):
    return d.strftime('%Y-%m-%dT%H:%M')


def make_db(today=None, days=170, ongoing=False, seed=7, weather=True, name='Giulia Rossi'):
    rnd = random.Random(seed)
    today = today or datetime.now().replace(second=0, microsecond=0)
    episodes = {}
    day_recs = {}
    wx = {}
    first_day = (today - timedelta(days=days)).date()
    eid = 0
    p = 1013.0
    for i in range(days, -1, -1):
        d = (today - timedelta(days=i)).date()
        key = d.isoformat()
        p += rnd.uniform(-4, 4)
        p = max(990, min(1030, p))
        if weather:
            wx[key] = {'p': round(p, 1), 'pMin': round(p - 2, 1), 'pMax': round(p + 2, 1), 't': round(rnd.uniform(8, 24), 1), 'h': round(rnd.uniform(40, 85))}
        freq = 0.30 if i > 90 else 0.2 if i > 40 else 0.14
        migraine = rnd.random() < freq and i > 0
        slept = round(rnd.choice([5, 5.5, 6, 6.5, 7, 7.5, 8]) - (0.9 if migraine else 0), 1)
        if rnd.random() < 0.6:
            day_recs[key] = {'checkin': True, 'sleepH': max(3, slept), 'sleepQ': rnd.randint(2, 5), 'stress': min(5, rnd.randint(1, 4) + (1 if migraine else 0)),
                             'mood': rnd.randint(2, 5), 'water': rnd.randint(2, 9), 'caffeine': rnd.randint(0, 4)}
            if (d.toordinal() % 28) < 4:
                day_recs[key]['menses'] = True
        elif rnd.random() < 0.3:
            day_recs[key] = {'free': True}
        if not migraine:
            continue
        start = datetime(d.year, d.month, d.day, rnd.choice([6, 7, 8, 9, 11, 14, 17, 20]), rnd.choice([0, 15, 30, 45]))
        dur = rnd.choice([90, 150, 240, 300, 420, 600, 900])
        end = start + timedelta(minutes=dur)
        meds = []
        nmeds = rnd.choice([0, 1, 1, 1, 2])
        for k in range(nmeds):
            name_, cls = rnd.choice(MEDS)
            meds.append({'name': name_, 'cls': cls, 'dose': rnd.choice(['', '50 mg', '400 mg', '1 cpr']),
                         'at': fmt(start + timedelta(minutes=20 + 40 * k)), 'effect': rnd.choice([None, 0, 1, 2, 2, 3])})
        eid += 1
        epid = f'etest{eid:05d}'
        episodes[epid] = {
            'id': epid, 'start': fmt(start), 'end': fmt(end), 'intensity': rnd.choice([3, 4, 5, 6, 6, 7, 7, 8, 9]),
            'type': rnd.choice(TYPES), 'side': rnd.choice(['sx', 'dx', 'bil', '']), 'areas': rnd.sample(['Fronte', 'Tempie', 'Nuca', 'Dietro un occhio'], rnd.randint(1, 2)),
            'quality': rnd.sample(['Pulsante', 'Pressante / a cerchio', 'Sordo'], 1), 'aura': ['Visiva (luci, zig-zag, macchie)'] if rnd.random() < 0.2 else [],
            'symptoms': rnd.sample(SYMPTOMS, rnd.randint(1, 3)), 'triggers': rnd.sample(TRIGGERS[:7], rnd.randint(0, 3)), 'meds': meds,
            'impact': rnd.choice([0, 1, 2, 2, 3]), 'work': rnd.choice([0, 0, 1, 2]),
            'note': rnd.choice(['', '', 'Giornata stressante al lavoro', 'Dopo una notte difficile', 'Mi è passato dopo aver dormito un po\'']),
            'createdAt': fmt(start), 'updatedAt': fmt(start),
        }
    if ongoing:
        start = today - timedelta(hours=2, minutes=14)
        eid += 1
        epid = f'etest{eid:05d}'
        episodes[epid] = {
            'id': epid, 'start': fmt(start), 'end': None, 'intensity': 7, 'type': 'con_aura', 'side': 'sx', 'areas': ['Tempie'], 'quality': ['Pulsante'], 'aura': [],
            'symptoms': ['Nausea'], 'triggers': ['Stress'], 'meds': [{'name': 'Rizatriptan', 'cls': 'triptan', 'dose': '10 mg', 'at': fmt(start + timedelta(minutes=30)), 'effect': None}],
            'impact': 2, 'work': 1, 'note': '', 'createdAt': fmt(start), 'updatedAt': fmt(start),
        }
    return {
        'schema': 1, 'createdAt': fmt(today - timedelta(days=days)),
        'settings': {'theme': 'auto', 'name': name, 'cycle': True, 'weatherOn': False, 'weatherLoc': None, 'assumeFree': True, 'pin': None, 'lockAfter': 0,
                     'hidden': {'triggers': [], 'symptoms': [], 'meds': []}, 'custom': {'triggers': ['Profumo forte'], 'symptoms': [], 'meds': []},
                     'lastBackupAt': fmt(today - timedelta(days=3)), 'backupRemindDays': 30, 'welcomeDone': True, 'installHintDismissed': True, 'reminderTime': '21:00'},
        'episodes': episodes, 'days': day_recs, 'weather': wx,
        'preventives': [
            {'id': 'ptest00001', 'name': 'Topiramato', 'dose': '50 mg la sera', 'start': (today - timedelta(days=75)).date().isoformat(), 'end': None, 'note': ''},
            {'id': 'ptest00002', 'name': 'Magnesio', 'dose': '', 'start': (today - timedelta(days=160)).date().isoformat(), 'end': (today - timedelta(days=100)).date().isoformat(), 'note': 'Sospeso per disturbi intestinali'},
        ] if days >= 160 else [],
    }


def init_script(db):
    payload = json.dumps(json.dumps(db))
    return f"if (!localStorage.getItem('emicrania.db.v1')) {{ localStorage.setItem('emicrania.db.v1', {payload}); }}"


def add_v2(db, today=None):
    """Aggiunge storia clinica, una terapia iniettiva, contatti, visite e un MIDAS (dati della versione 2)."""
    today = today or datetime.now().replace(second=0, microsecond=0)
    d = lambda n: (today - timedelta(days=n)).date().isoformat()  # noqa: E731
    first_diary = (today - timedelta(days=200)).date()
    db['history'] = {
        'birthYear': today.year - 36, 'sex': 'f', 'onsetAge': 14, 'diagnoses': ['Emicrania senza aura', 'Emicrania cronica'], 'diagYear': today.year - 4,
        'diagBy': 'Centro cefalee', 'famKnown': 'yes', 'family': ['Madre'],
        'typical': {'side': 'sx', 'quality': ['Pulsante'], 'areas': ['Tempie'], 'intensity': 8, 'duration': '24to72', 'aura': 'never', 'auraTypes': [],
                    'symptoms': ['Nausea', 'Sensibilità alla luce'], 'triggers': ['Stress', 'Poco sonno'], 'activity': 'yes'},
        'periods': [
            {'id': 'htest00001', 'from': f'{today.year - 12}-01', 'to': f'{today.year - 6}-12', 'days': 4, 'intensity': 7, 'acute': 3, 'note': 'Università'},
            {'id': 'htest00002', 'from': f'{today.year - 5}-01', 'to': (first_diary - timedelta(days=31)).strftime('%Y-%m'), 'days': 14, 'intensity': 8, 'acute': 9, 'note': ''},
        ],
        'events': [{'id': 'xtest00001', 'date': f'{today.year - 3}-10', 'title': 'Stato emicranico, pronto soccorso', 'text': 'Attacco di 4 giorni con vomito.', 'intensity': 10, 'er': True, 'hosp': False}],
        'acute': [{'id': 'atest00001', 'name': 'Sumatriptan', 'cls': 'triptan', 'effect': 2, 'note': ''}],
        'conditions': ['Ansia'], 'conditionsNote': '', 'allergies': '', 'otherMeds': '', 'cycleLink': 'yes', 'contraception': '',
        'narrative': 'Ho iniziato ad avere mal di testa da ragazza. Negli ultimi anni gli attacchi sono diventati molto frequenti.',
        'updatedAt': fmt(today - timedelta(days=5)),
    }
    doses = [d(n) for n in range(120, -1, -28)]
    db['preventives'] = db.get('preventives', []) + [{
        'id': 'ptest00003', 'name': 'Erenumab', 'cls': 'mab', 'dose': '140 mg', 'start': d(120), 'end': None, 'every': 28, 'doses': doses,
        'stop': '', 'sides': ['Stipsi'], 'rating': 2, 'doctor': 'Dr.ssa Bianchi', 'baseDays': 14, 'baseInt': 8, 'note': '',
    }]
    db['contacts'] = [{'id': 'ctest00001', 'name': 'Centro Cefalee', 'role': 'center', 'org': 'Ospedale di prova', 'dept': 'Neurologia', 'address': 'Via Roma 1, Milano',
                       'phone': '02 1234 5678', 'phone2': '', 'email': 'cefalee@example.org', 'hours': 'Lun–Ven 9–13', 'note': '', 'main': True}]
    db['visits'] = [{'id': 'vtest00001', 'at': fmt(today + timedelta(days=6)), 'kind': 'followup', 'contactId': 'ctest00001', 'place': 'Ambulatorio 3', 'note': '',
                     'questions': 'Posso ridurre il triptano?', 'outcome': ''}]
    db['assessments'] = [{'id': 'mtest00001', 'date': d(130), 'kind': 'midas', 'q': [10, 8, 6, 5, 4], 'a': 40, 'b': 8},
                         {'id': 'mtest00002', 'date': d(10), 'kind': 'midas', 'q': [3, 2, 2, 1, 1], 'a': 15, 'b': 6}]
    db['docs'] = []
    return db


if __name__ == '__main__':
    db = make_db()
    print(len(db['episodes']), 'episodi,', len(db['days']), 'giornate')
