#!/usr/bin/env python3
"""Replace fictional Pitch Clash clubs with real-world clubs (2025-26 season)."""
import re, pathlib

P = pathlib.Path('/home/user/repo/src/data/teams.js')
src = P.read_text()

def lum(h):
    h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def entry(name, short, rating, shirt, shorts, socks, country=None):
    alt = '#ffffff' if lum(shirt) < 0.45 else '#111111'
    row = f"    ['{name}', '{short}', {rating}, '{shirt}', '{shorts}', '{socks}', '{alt}', '{alt}', '{shirt}'"
    if country:
        row += f", '{country}'"
    return row + '],\n'

def block(lid, clubs):
    return f'  {lid}: [\n' + ''.join(entry(*c) for c in clubs) + '  ],\n'

C = {}
C['alb'] = [
 ("Arsenal", "ARS", 87, "#ef0107", "#ffffff", "#ef0107"), ("Aston Villa", "AVL", 83, "#670e36", "#ffffff", "#670e36"),
 ("Bournemouth", "BOU", 79, "#da291c", "#000000", "#da291c"), ("Brentford", "BRE", 79, "#e30613", "#ffffff", "#e30613"),
 ("Brighton", "BHA", 81, "#0057b8", "#0057b8", "#ffffff"), ("Burnley", "BUR", 72, "#6c1d45", "#87ceeb", "#6c1d45"),
 ("Chelsea", "CHE", 85, "#034694", "#034694", "#ffffff"), ("Crystal Palace", "CRY", 78, "#1b458f", "#1b458f", "#1b458f"),
 ("Everton", "EVE", 78, "#003399", "#ffffff", "#003399"), ("Fulham", "FUL", 80, "#ffffff", "#000000", "#ffffff"),
 ("Leeds United", "LEE", 76, "#ffffff", "#ffffff", "#1d428a"), ("Liverpool", "LIV", 89, "#c8102e", "#c8102e", "#c8102e"),
 ("Manchester City", "MCI", 89, "#6cabdd", "#ffffff", "#6cabdd"), ("Manchester United", "MUN", 82, "#da291c", "#ffffff", "#000000"),
 ("Newcastle United", "NEW", 84, "#241f20", "#ffffff", "#241f20"), ("Nottingham Forest", "NFO", 81, "#dd0000", "#ffffff", "#dd0000"),
 ("Sunderland", "SUN", 75, "#eb0037", "#ffffff", "#eb0037"), ("Tottenham Hotspur", "TOT", 83, "#ffffff", "#132257", "#ffffff"),
 ("West Ham United", "WHU", 78, "#7a263a", "#ffffff", "#7a263a"), ("Wolverhampton Wanderers", "WOL", 74, "#fdb913", "#000000", "#000000"),
]
C['ibe'] = [
 ("Alavés", "ALA", 72, "#004b8d", "#ffffff", "#004b8d"), ("Athletic Club", "ATH", 81, "#ee2523", "#000000", "#000000"),
 ("Atlético Madrid", "ATM", 86, "#cb3524", "#0a2a66", "#cb3524"), ("Barcelona", "BAR", 89, "#a50044", "#004d98", "#a50044"),
 ("Real Betis", "BET", 80, "#00954c", "#ffffff", "#00954c"), ("Celta Vigo", "CEL", 78, "#8ac3ee", "#ffffff", "#8ac3ee"),
 ("Elche", "ELC", 71, "#ffffff", "#046a38", "#ffffff"), ("Espanyol", "ESP", 75, "#ffffff", "#0083c5", "#ffffff"),
 ("Getafe", "GET", 73, "#0055a4", "#0055a4", "#0055a4"), ("Girona", "GIR", 77, "#cd2534", "#ffffff", "#cd2534"),
 ("Levante", "LEV", 72, "#8a1538", "#0a2a66", "#8a1538"), ("Mallorca", "MLL", 74, "#e20613", "#000000", "#e20613"),
 ("Osasuna", "OSA", 75, "#0a3466", "#0a3466", "#0a3466"), ("Real Oviedo", "OVI", 70, "#0a3d91", "#ffffff", "#0a3d91"),
 ("Rayo Vallecano", "RAY", 76, "#ffffff", "#ffffff", "#e30613"), ("Real Madrid", "RMA", 90, "#ffffff", "#ffffff", "#ffffff"),
 ("Real Sociedad", "RSO", 79, "#0067b1", "#ffffff", "#0067b1"), ("Sevilla", "SEV", 79, "#ffffff", "#ffffff", "#d00027"),
 ("Valencia", "VAL", 77, "#ffffff", "#000000", "#ff7a00"), ("Villarreal", "VIL", 82, "#ffe667", "#004b8d", "#ffe667"),
]
C['pen'] = [
 ("Atalanta", "ATA", 84, "#1e71b8", "#000000", "#1e71b8"), ("Bologna", "BOL", 81, "#a31c34", "#0a2a66", "#a31c34"),
 ("Cagliari", "CAG", 73, "#a91e22", "#0a2a66", "#a91e22"), ("Como", "COM", 76, "#005ca9", "#ffffff", "#005ca9"),
 ("Cremonese", "CRE", 71, "#7a1f3d", "#7a1f3d", "#7a1f3d"), ("Fiorentina", "FIO", 80, "#582c83", "#ffffff", "#582c83"),
 ("Genoa", "GEN", 74, "#d00027", "#0a2a66", "#0a2a66"), ("Inter", "INT", 88, "#0068a8", "#000000", "#0068a8"),
 ("Juventus", "JUV", 85, "#ffffff", "#000000", "#ffffff"), ("Lazio", "LAZ", 82, "#87d8f7", "#ffffff", "#87d8f7"),
 ("Lecce", "LEC", 71, "#e8c547", "#a91e22", "#e8c547"), ("AC Milan", "MIL", 85, "#fb090b", "#000000", "#000000"),
 ("Napoli", "NAP", 87, "#12a0d7", "#ffffff", "#12a0d7"), ("Parma", "PAR", 74, "#f7d117", "#0a2a66", "#f7d117"),
 ("Pisa", "PIS", 69, "#000000", "#1e71b8", "#000000"), ("AS Roma", "ROM", 83, "#8e1f2f", "#8e1f2f", "#f0bc42"),
 ("Sassuolo", "SAS", 75, "#00a651", "#000000", "#00a651"), ("Torino", "TOR", 76, "#5e0b15", "#ffffff", "#5e0b15"),
 ("Udinese", "UDI", 75, "#ffffff", "#000000", "#ffffff"), ("Hellas Verona", "VER", 70, "#005ca9", "#f7d117", "#005ca9"),
]
C['teu'] = [
 ("FC Augsburg", "AUG", 73, "#ba3733", "#ffffff", "#ba3733"), ("Bayern Munich", "BAY", 89, "#dc052d", "#dc052d", "#dc052d"),
 ("Borussia Dortmund", "BVB", 85, "#fde100", "#000000", "#fde100"), ("Eintracht Frankfurt", "SGE", 82, "#e1000f", "#000000", "#e1000f"),
 ("SC Freiburg", "SCF", 79, "#ffffff", "#ffffff", "#e30613"), ("Borussia Mönchengladbach", "BMG", 76, "#ffffff", "#000000", "#000000"),
 ("Hamburger SV", "HSV", 74, "#ffffff", "#0a2a66", "#dd0741"), ("FC Heidenheim", "FCH", 70, "#e30613", "#ffffff", "#e30613"),
 ("TSG Hoffenheim", "TSG", 75, "#1c63b7", "#ffffff", "#1c63b7"), ("1. FC Köln", "KOE", 73, "#ed1c24", "#ffffff", "#ed1c24"),
 ("Bayer Leverkusen", "B04", 86, "#e32221", "#000000", "#e32221"), ("RB Leipzig", "RBL", 83, "#ffffff", "#dd0741", "#ffffff"),
 ("Mainz 05", "M05", 77, "#ed1c24", "#ed1c24", "#ffffff"), ("FC St. Pauli", "STP", 72, "#5c3317", "#ffffff", "#5c3317"),
 ("VfB Stuttgart", "VFB", 82, "#ffffff", "#e32221", "#ffffff"), ("Union Berlin", "FCU", 77, "#f6c90e", "#e32221", "#f6c90e"),
 ("Werder Bremen", "SVW", 76, "#1d9053", "#ffffff", "#1d9053"), ("VfL Wolfsburg", "WOB", 75, "#65b32e", "#ffffff", "#65b32e"),
]
C['hex'] = [
 ("Angers", "ANG", 71, "#ffffff", "#000000", "#000000"), ("Auxerre", "AJA", 72, "#ffffff", "#0a2a66", "#ffffff"),
 ("Brest", "SB29", 76, "#e30613", "#ffffff", "#e30613"), ("Lens", "RCL", 80, "#fff200", "#e30613", "#fff200"),
 ("Le Havre", "HAC", 71, "#7ab5e6", "#0a2a66", "#7ab5e6"), ("Lille", "LOSC", 82, "#e01e13", "#0a2a66", "#e01e13"),
 ("Lorient", "FCL", 72, "#ff7a00", "#ffffff", "#ff7a00"), ("Lyon", "OL", 81, "#ffffff", "#da291c", "#0a2a66"),
 ("Marseille", "OM", 83, "#2faee0", "#ffffff", "#2faee0"), ("Metz", "FCM", 70, "#5e0b15", "#5e0b15", "#5e0b15"),
 ("Monaco", "ASM", 83, "#ffffff", "#e30613", "#ffffff"), ("Nantes", "FCN", 73, "#f7d117", "#00843d", "#f7d117"),
 ("Nice", "OGCN", 79, "#e30613", "#000000", "#e30613"), ("Paris FC", "PFC", 71, "#0a2a66", "#ffffff", "#0a2a66"),
 ("Paris Saint-Germain", "PSG", 89, "#004170", "#004170", "#da291c"), ("Rennes", "SRFC", 77, "#e30613", "#000000", "#e30613"),
 ("Strasbourg", "RCSA", 78, "#009fe3", "#ffffff", "#009fe3"), ("Toulouse", "TFC", 75, "#5e2b97", "#ffffff", "#5e2b97"),
]
C['low'] = [
 ("Ajax", "AJA", 84, "#ffffff", "#ffffff", "#d00027"), ("AZ Alkmaar", "AZ", 79, "#e30613", "#ffffff", "#e30613"),
 ("Excelsior", "EXC", 68, "#e30613", "#000000", "#e30613"), ("Feyenoord", "FEY", 83, "#ffffff", "#000000", "#cc0000"),
 ("Fortuna Sittard", "FOR", 72, "#f7d117", "#00843d", "#f7d117"), ("Go Ahead Eagles", "GAE", 75, "#e30613", "#f7d117", "#e30613"),
 ("FC Groningen", "GRO", 73, "#ffffff", "#00843d", "#ffffff"), ("Heerenveen", "HEE", 73, "#7ab5e6", "#ffffff", "#7ab5e6"),
 ("Heracles Almelo", "HER", 71, "#ffffff", "#000000", "#ffffff"), ("NAC Breda", "NAC", 70, "#f7d117", "#000000", "#f7d117"),
 ("NEC Nijmegen", "NEC", 74, "#e30613", "#00843d", "#e30613"), ("PSV Eindhoven", "PSV", 85, "#e30613", "#ffffff", "#0a2a66"),
 ("Sparta Rotterdam", "SPA", 72, "#ffffff", "#e30613", "#ffffff"), ("FC Twente", "TWE", 78, "#e30613", "#ffffff", "#e30613"),
 ("FC Utrecht", "UTR", 77, "#ffffff", "#e30613", "#ffffff"), ("FC Volendam", "VOL", 69, "#ff7a00", "#ffffff", "#ff7a00"),
]
C['lus'] = [
 ("Alverca", "ALV", 68, "#e30613", "#0a2a66", "#e30613"), ("Arouca", "ARO", 71, "#f7d117", "#0a2a66", "#f7d117"),
 ("AVS", "AVS", 67, "#e30613", "#ffffff", "#e30613"), ("Benfica", "BEN", 85, "#e30613", "#ffffff", "#e30613"),
 ("Braga", "BRA", 80, "#ffffff", "#e30613", "#ffffff"), ("Casa Pia", "CAS", 70, "#000000", "#ffffff", "#000000"),
 ("Estoril", "EST", 73, "#f7d117", "#0a2a66", "#f7d117"), ("Estrela Amadora", "EST", 69, "#ffffff", "#e30613", "#00843d"),
 ("Famalicão", "FAM", 74, "#ffffff", "#0a2a66", "#ffffff"), ("Gil Vicente", "GIL", 72, "#e30613", "#0a2a66", "#e30613"),
 ("Moreirense", "MOR", 71, "#00843d", "#ffffff", "#00843d"), ("Nacional", "NAC", 69, "#000000", "#ffffff", "#000000"),
 ("FC Porto", "POR", 84, "#0a2a66", "#ffffff", "#0a2a66"), ("Rio Ave", "RIO", 70, "#00843d", "#ffffff", "#00843d"),
 ("Sporting CP", "SPO", 86, "#00843d", "#ffffff", "#00843d"), ("Vitória Guimarães", "VIT", 75, "#ffffff", "#000000", "#ffffff"),
]
C['ana'] = [
 ("Alanyaspor", "ALA", 70, "#ff7a00", "#00843d", "#ff7a00"), ("Antalyaspor", "ANT", 69, "#e30613", "#ffffff", "#e30613"),
 ("Başakşehir", "IBA", 73, "#ff7a00", "#0a2a66", "#ff7a00"), ("Beşiktaş", "BJK", 79, "#ffffff", "#000000", "#ffffff"),
 ("Çaykur Rizespor", "RIZ", 70, "#00843d", "#ffffff", "#00843d"), ("Eyüpspor", "EYU", 69, "#5e2b97", "#f7d117", "#5e2b97"),
 ("Fenerbahçe", "FEN", 82, "#ffed00", "#0a2a66", "#ffed00"), ("Galatasaray", "GAL", 83, "#f7d117", "#a32638", "#f7d117"),
 ("Gaziantep", "GAZ", 69, "#e30613", "#000000", "#e30613"), ("Gençlerbirliği", "GEN", 67, "#e30613", "#000000", "#e30613"),
 ("Göztepe", "GOZ", 72, "#f7d117", "#e30613", "#f7d117"), ("Konyaspor", "KON", 70, "#ffffff", "#00843d", "#ffffff"),
 ("Kocaelispor", "KOC", 68, "#00843d", "#000000", "#00843d"), ("Samsunspor", "SAM", 74, "#e30613", "#ffffff", "#e30613"),
 ("Trabzonspor", "TRA", 78, "#7ab5e6", "#5e0b15", "#7ab5e6"), ("Fatih Karagümrük", "KAR", 67, "#000000", "#e30613", "#000000"),
]
C['cal'] = [
 ("Aberdeen", "ABE", 72, "#e30613", "#ffffff", "#e30613"), ("Celtic", "CEL", 80, "#ffffff", "#00843d", "#ffffff"),
 ("Dundee", "DUN", 68, "#0a2a66", "#ffffff", "#0a2a66"), ("Dundee United", "DUN", 69, "#ff7a00", "#000000", "#ff7a00"),
 ("Falkirk", "FAL", 66, "#0a2a66", "#ffffff", "#0a2a66"), ("Hearts", "HEA", 74, "#5e0b15", "#ffffff", "#5e0b15"),
 ("Hibernian", "HIB", 73, "#00843d", "#ffffff", "#00843d"), ("Kilmarnock", "KIL", 69, "#0a2a66", "#ffffff", "#0a2a66"),
 ("Livingston", "LIV", 66, "#f7d117", "#000000", "#f7d117"), ("Motherwell", "MOT", 69, "#f7d117", "#5e0b15", "#f7d117"),
 ("Rangers", "RAN", 79, "#0a2a66", "#ffffff", "#0a2a66"), ("St Mirren", "STM", 69, "#ffffff", "#000000", "#ffffff"),
]
C['bsr'] = [
 ("Atlético Mineiro", "CAM", 80, "#000000", "#ffffff", "#000000"), ("Bahia", "BAH", 77, "#ffffff", "#0a2a66", "#e30613"),
 ("Botafogo", "BOT", 82, "#000000", "#ffffff", "#000000"), ("Bragantino", "RBB", 76, "#ffffff", "#e30613", "#ffffff"),
 ("Ceará", "CEA", 73, "#ffffff", "#000000", "#ffffff"), ("Corinthians", "COR", 80, "#ffffff", "#000000", "#ffffff"),
 ("Cruzeiro", "CRU", 79, "#0a2a66", "#ffffff", "#0a2a66"), ("Flamengo", "FLA", 84, "#e30613", "#000000", "#e30613"),
 ("Fluminense", "FLU", 80, "#5e0b15", "#ffffff", "#00843d"), ("Fortaleza", "FOR", 77, "#0a2a66", "#ffffff", "#e30613"),
 ("Grêmio", "GRE", 78, "#7ab5e6", "#000000", "#7ab5e6"), ("Internacional", "INT", 79, "#e30613", "#ffffff", "#e30613"),
 ("Mirassol", "MIR", 74, "#f7d117", "#00843d", "#f7d117"), ("Palmeiras", "PAL", 83, "#00843d", "#ffffff", "#00843d"),
 ("Santos", "SAN", 77, "#ffffff", "#ffffff", "#000000"), ("São Paulo", "SAO", 80, "#ffffff", "#000000", "#e30613"),
]
C['pla'] = [
 ("Argentinos Juniors", "ARG", 75, "#e30613", "#ffffff", "#e30613"), ("Atlético Tucumán", "ATU", 71, "#7ab5e6", "#ffffff", "#0a2a66"),
 ("Banfield", "BAN", 71, "#ffffff", "#00843d", "#ffffff"), ("Barracas Central", "BAR", 70, "#e30613", "#ffffff", "#e30613"),
 ("Belgrano", "BEL", 72, "#7ab5e6", "#000000", "#7ab5e6"), ("Boca Juniors", "BOC", 82, "#0a2a66", "#0a2a66", "#f7d117"),
 ("Defensa y Justicia", "DYJ", 73, "#f7d117", "#00843d", "#f7d117"), ("Estudiantes", "EST", 77, "#e30613", "#ffffff", "#e30613"),
 ("Huracán", "HUR", 74, "#ffffff", "#e30613", "#ffffff"), ("Independiente", "IND", 76, "#e30613", "#ffffff", "#e30613"),
 ("Lanús", "LAN", 73, "#5e0b15", "#ffffff", "#5e0b15"), ("Racing Club", "RAC", 79, "#7ab5e6", "#ffffff", "#7ab5e6"),
 ("River Plate", "RIV", 83, "#ffffff", "#000000", "#e30613"), ("Rosario Central", "ROS", 76, "#0a2a66", "#f7d117", "#0a2a66"),
 ("San Lorenzo", "SAN", 75, "#0a2a66", "#e30613", "#0a2a66"), ("Vélez Sarsfield", "VEL", 75, "#ffffff", "#0a2a66", "#ffffff"),
]
C['cam'] = [
 ("Atlanta United", "ATL", 73, "#5e0b15", "#000000", "#5e0b15"), ("Charlotte FC", "CHA", 71, "#0a2a66", "#ffffff", "#0a2a66"),
 ("Chicago Fire", "CHI", 70, "#e30613", "#0a2a66", "#e30613"), ("FC Cincinnati", "CIN", 74, "#ff7a00", "#0a2a66", "#ff7a00"),
 ("Columbus Crew", "CLB", 75, "#f7d117", "#000000", "#f7d117"), ("FC Dallas", "DAL", 71, "#e30613", "#ffffff", "#0a2a66"),
 ("Houston Dynamo", "HOU", 72, "#ff7a00", "#ffffff", "#ff7a00"), ("Inter Miami", "MIA", 78, "#f5a3c7", "#000000", "#f5a3c7"),
 ("LA Galaxy", "LAG", 74, "#ffffff", "#0a2a66", "#00245d"), ("LAFC", "LAFC", 76, "#000000", "#000000", "#c39e6d"),
 ("Nashville SC", "NSH", 71, "#e8c547", "#0a2a66", "#e8c547"), ("New York City FC", "NYC", 73, "#7ab5e6", "#0a2a66", "#7ab5e6"),
 ("Philadelphia Union", "PHI", 74, "#0a2a66", "#dfd1a7", "#0a2a66"), ("Portland Timbers", "POR", 72, "#00843d", "#ffffff", "#00843d"),
 ("Seattle Sounders", "SEA", 74, "#5dade2", "#ffffff", "#5dade2"), ("Toronto FC", "TOR", 70, "#e30613", "#ffffff", "#e30613"),
]
C['gul'] = [
 ("Al Ahli", "AHL", 78, "#ffffff", "#00843d", "#ffffff"), ("Al Ettifaq", "ETT", 72, "#00843d", "#ffffff", "#e30613"),
 ("Al Fateh", "FAT", 70, "#0a2a66", "#ffffff", "#0a2a66"), ("Al Hilal", "HIL", 83, "#0a2a66", "#ffffff", "#0a2a66"),
 ("Al Ittihad", "ITT", 81, "#f7d117", "#000000", "#f7d117"), ("Al Khaleej", "KHA", 69, "#00843d", "#ffffff", "#00843d"),
 ("Al Nassr", "NAS", 82, "#f7d117", "#0a2a66", "#f7d117"), ("Al Okhdood", "OKH", 66, "#7ab5e6", "#ffffff", "#7ab5e6"),
 ("Al Qadsiah", "QAD", 74, "#e30613", "#ffffff", "#e30613"), ("Al Riyadh", "RIY", 68, "#ffffff", "#e30613", "#ffffff"),
 ("Al Shabab", "SHA", 73, "#ffffff", "#000000", "#000000"), ("Al Taawoun", "TAA", 72, "#f7d117", "#5e0b15", "#f7d117"),
 ("Damac", "DAM", 68, "#e30613", "#f7d117", "#e30613"), ("Neom SC", "NEO", 71, "#0a2a66", "#ffffff", "#0a2a66"),
]
C['afr'] = [
 ("Al Ahly", "AHL", 82, "#e30613", "#ffffff", "#e30613", "egy"), ("Espérance de Tunis", "EST", 79, "#f7d117", "#e30613", "#f7d117", "tun"),
 ("Mamelodi Sundowns", "SUN", 80, "#f7d117", "#0a2a66", "#f7d117", "rsa"), ("TP Mazembe", "TPM", 77, "#000000", "#ffffff", "#000000", "cod"),
 ("Wydad AC", "WAC", 78, "#e30613", "#ffffff", "#e30613", "mar"), ("Raja Casablanca", "RCA", 77, "#00843d", "#ffffff", "#00843d", "mar"),
 ("Zamalek", "ZAM", 78, "#ffffff", "#e30613", "#ffffff", "egy"), ("Orlando Pirates", "PIR", 76, "#000000", "#ffffff", "#000000", "rsa"),
 ("Kaizer Chiefs", "KAI", 74, "#f7d117", "#000000", "#f7d117", "rsa"), ("Enyimba", "ENY", 72, "#0a2a66", "#ffffff", "#0a2a66", "nga"),
 ("Rivers United", "RIV", 71, "#0a2a66", "#ffffff", "#0a2a66", "nga"), ("Asante Kotoko", "KOT", 73, "#e30613", "#ffffff", "#e30613", "gha"),
 ("Hearts of Oak", "HEA", 71, "#0a2a66", "#ffffff", "#e30613", "gha"), ("Simba SC", "SIM", 72, "#e30613", "#ffffff", "#e30613", "tan"),
 ("Young Africans", "YGA", 73, "#f7d117", "#00843d", "#f7d117", "tan"), ("ASEC Mimosas", "ASE", 72, "#f7d117", "#000000", "#f7d117", "civ"),
]
C['row'] = [
 ("Olympiacos", "OLY", 79, "#e30613", "#ffffff", "#e30613", "gre"), ("Panathinaikos", "PAN", 76, "#00843d", "#ffffff", "#00843d", "gre"),
 ("Club Brugge", "CLU", 79, "#0a2a66", "#000000", "#0a2a66", "bel"), ("Anderlecht", "AND", 75, "#5e2b97", "#ffffff", "#5e2b97", "bel"),
 ("Shakhtar Donetsk", "SHA", 77, "#ff7a00", "#000000", "#ff7a00", "ukr"), ("Dynamo Kyiv", "DYN", 75, "#ffffff", "#0a2a66", "#ffffff", "ukr"),
 ("Red Star Belgrade", "RSB", 76, "#e30613", "#ffffff", "#e30613", "srb"), ("Partizan Belgrade", "PAR", 73, "#000000", "#ffffff", "#000000", "srb"),
 ("Sparta Prague", "SPA", 75, "#5e0b15", "#ffffff", "#5e0b15", "cze"), ("Slavia Prague", "SLA", 76, "#ffffff", "#e30613", "#ffffff", "cze"),
 ("RB Salzburg", "SAL", 76, "#ffffff", "#e30613", "#ffffff", "aut"), ("Young Boys", "YB", 74, "#f7d117", "#000000", "#f7d117", "sui"),
 ("FC Copenhagen", "FCK", 76, "#ffffff", "#0a2a66", "#ffffff", "den"), ("Malmö FF", "MAL", 73, "#7ab5e6", "#ffffff", "#7ab5e6", "swe"),
 ("Dinamo Zagreb", "DIN", 75, "#0a2a66", "#ffffff", "#0a2a66", "cro"), ("Legia Warsaw", "LEG", 73, "#ffffff", "#000000", "#000000", "pol"),
 ("Petro de Luanda", "PET", 71, "#e30613", "#f7d117", "#e30613", "ang"), ("Horoya AC", "HOR", 69, "#e30613", "#ffffff", "#e30613", "gui"),
 ("Coton Sport", "COT", 69, "#00843d", "#ffffff", "#00843d", "cmr"), ("Stade Malien", "STA", 68, "#ffffff", "#0a2a66", "#ffffff", "mli"),
 ("Teungueth FC", "TEU", 67, "#0a2a66", "#f7d117", "#0a2a66", "sen"), ("Jwaneng Galaxy", "JWA", 66, "#000000", "#f7d117", "#000000", "bot"),
 ("Guanabara FC", "GUA", 79, "#e30613", "#000000", "#e30613", "bra"), ("Serra Paulista FC", "SPF", 78, "#00843d", "#ffffff", "#00843d", "bra"),
 ("Montevideo Celeste Club", "MCC", 75, "#7ab5e6", "#000000", "#7ab5e6", "uru"), ("Tenochtitlan Serpientes", "TSE", 74, "#f7d117", "#0a2a66", "#f7d117", "mex"),
 ("Pacific Coast SC", "PCS", 70, "#2a9d8f", "#ffffff", "#2a9d8f", "usa"), ("Kanto Sakura FC", "KSF", 72, "#f5a3c7", "#ffffff", "#f5a3c7", "jpn"),
 ("Riyadh Desert Hawks", "RDH", 73, "#0a2a66", "#ffffff", "#f7d117", "ksa"), ("Waitematā Tide FC", "WTD", 62, "#000000", "#ffffff", "#000000", "nzl"),
 ("Suva Reef FC", "SRF", 57, "#7ab5e6", "#ffffff", "#7ab5e6", "fij"), ("Río de la Plata Atlético", "RPA", 79, "#0a2a66", "#f7d117", "#0a2a66", "arg"),
]

ROW_EXTRA = [
 ("Peñarol", "PEN", 77, "#f7d117", "#000000", "#f7d117", "uru"), ("Club Nacional", "NAC", 76, "#ffffff", "#0a2a66", "#e30613", "uru"),
 ("Colo-Colo", "COL", 75, "#ffffff", "#000000", "#000000", "chi"), ("Olimpia", "OLI", 74, "#ffffff", "#000000", "#ffffff", "par"),
 ("Cerro Porteño", "CER", 73, "#0a2a66", "#e30613", "#0a2a66", "par"), ("LDU Quito", "LDU", 74, "#ffffff", "#e30613", "#0a2a66", "ecu"),
 ("Barcelona SC", "BSC", 73, "#f7d117", "#000000", "#f7d117", "ecu"), ("Sporting Cristal", "CRI", 72, "#7ab5e6", "#ffffff", "#7ab5e6", "per"),
 ("Alianza Lima", "ALI", 71, "#0a2a66", "#ffffff", "#0a2a66", "per"), ("Club Bolívar", "BOL", 70, "#7ab5e6", "#ffffff", "#7ab5e6", "bol"),
 ("The Strongest", "STR", 69, "#f7d117", "#000000", "#f7d117", "bol"),
 ("Club América", "AME", 78, "#f7d117", "#0a2a66", "#f7d117", "mex"), ("Chivas Guadalajara", "CHI", 75, "#ffffff", "#e30613", "#0a2a66", "mex"),
 ("Cruz Azul", "CAZ", 76, "#0a2a66", "#ffffff", "#e30613", "mex"), ("Tigres UANL", "TIG", 77, "#f7d117", "#0a2a66", "#f7d117", "mex"),
 ("Monterrey", "MON", 76, "#0a2a66", "#ffffff", "#0a2a66", "mex"), ("Deportivo Saprissa", "SAP", 70, "#5e2b97", "#ffffff", "#5e2b97", "crc"),
 ("LD Alajuelense", "ALA", 69, "#e30613", "#000000", "#e30613", "crc"), ("Olimpia", "OLI", 68, "#ffffff", "#e30613", "#ffffff", "hon"),
 ("Urawa Red Diamonds", "URA", 74, "#e30613", "#ffffff", "#000000", "jpn"), ("Kashima Antlers", "KAS", 73, "#e30613", "#0a2a66", "#e30613", "jpn"),
 ("Yokohama F. Marinos", "YOK", 73, "#0a2a66", "#ffffff", "#e30613", "jpn"), ("Jeonbuk Motors", "JEO", 72, "#00843d", "#ffffff", "#00843d", "kor"),
 ("Ulsan HD", "ULS", 72, "#0a2a66", "#ffffff", "#0a2a66", "kor"), ("Al Ain", "AIN", 73, "#5e2b97", "#ffffff", "#5e2b97", "uae"),
 ("Persepolis", "PER", 73, "#e30613", "#ffffff", "#e30613", "irn"), ("Esteghlal", "EST", 72, "#0a2a66", "#ffffff", "#0a2a66", "irn"),
 ("Al Sadd", "SAD", 72, "#ffffff", "#000000", "#000000", "qat"), ("Johor Darul Ta'zim", "JDT", 70, "#0a2a66", "#e30613", "#0a2a66", "mas"),
 ("Buriram United", "BUR", 69, "#0a2a66", "#ffffff", "#0a2a66", "tha"), ("Melbourne Victory", "MEL", 70, "#0a2a66", "#ffffff", "#0a2a66", "aus"),
 ("Sydney FC", "SYD", 69, "#7ab5e6", "#0a2a66", "#7ab5e6", "aus"), ("Auckland City", "AUC", 64, "#0a2a66", "#ffffff", "#0a2a66", "nzl"),
]

ALB2 = [
 ("Birmingham City", "BIR", 72, "#0a2a66", "#ffffff", "#0a2a66"), ("Blackburn Rovers", "BLA", 71, "#ffffff", "#0a2a66", "#e30613"),
 ("Bristol City", "BRI", 71, "#e30613", "#ffffff", "#e30613"), ("Coventry City", "COV", 73, "#7ab5e6", "#ffffff", "#7ab5e6"),
 ("Derby County", "DER", 70, "#ffffff", "#000000", "#ffffff"), ("Hull City", "HUL", 69, "#ff7a00", "#000000", "#ff7a00"),
 ("Ipswich Town", "IPS", 73, "#0a2a66", "#ffffff", "#0a2a66"), ("Leicester City", "LEI", 76, "#0a2a66", "#ffffff", "#0a2a66"),
 ("Middlesbrough", "MID", 71, "#e30613", "#ffffff", "#e30613"), ("Millwall", "MIL", 70, "#0a2a66", "#ffffff", "#0a2a66"),
 ("Norwich City", "NOR", 71, "#f7d117", "#00843d", "#f7d117"), ("Oxford United", "OXF", 68, "#f7d117", "#0a2a66", "#f7d117"),
 ("Portsmouth", "POR", 69, "#0a2a66", "#ffffff", "#0a2a66"), ("Preston North End", "PNE", 69, "#ffffff", "#0a2a66", "#ffffff"),
 ("Queens Park Rangers", "QPR", 70, "#ffffff", "#0a2a66", "#ffffff"), ("Sheffield United", "SHU", 72, "#e30613", "#ffffff", "#000000"),
 ("Southampton", "SOU", 73, "#e30613", "#ffffff", "#000000"), ("Stoke City", "STO", 69, "#e30613", "#ffffff", "#e30613"),
 ("Swansea City", "SWA", 69, "#ffffff", "#000000", "#ffffff"), ("Watford", "WAT", 70, "#f7d117", "#000000", "#f7d117"),
 ("West Bromwich Albion", "WBA", 71, "#0a2a66", "#ffffff", "#0a2a66"), ("Wrexham", "WRE", 70, "#e30613", "#ffffff", "#00843d"),
]
IBE2 = [
 ("Albacete", "ALB", 70, "#ffffff", "#000000", "#ffffff"), ("Almería", "ALM", 71, "#e30613", "#ffffff", "#e30613"),
 ("FC Andorra", "AND", 68, "#f7d117", "#0a2a66", "#f7d117"), ("Burgos", "BUR", 68, "#ffffff", "#000000", "#ffffff"),
 ("Cádiz", "CAD", 70, "#f7d117", "#0a2a66", "#f7d117"), ("Castellón", "CAS", 69, "#000000", "#ffffff", "#000000"),
 ("Ceuta", "CEU", 66, "#ffffff", "#e30613", "#ffffff"), ("Córdoba", "COR", 69, "#ffffff", "#00843d", "#ffffff"),
 ("Cultural Leonesa", "CUL", 67, "#ffffff", "#e30613", "#ffffff"), ("Deportivo La Coruña", "DEP", 71, "#0a2a66", "#ffffff", "#0a2a66"),
 ("Eibar", "EIB", 70, "#5e0b15", "#0a2a66", "#5e0b15"), ("Granada", "GRA", 71, "#e30613", "#ffffff", "#0a2a66"),
 ("Huesca", "HUE", 69, "#0a2a66", "#5e0b15", "#0a2a66"), ("Las Palmas", "LPA", 71, "#f7d117", "#0a2a66", "#f7d117"),
 ("Leganés", "LEG", 70, "#ffffff", "#0a2a66", "#ffffff"), ("Málaga", "MAG", 69, "#ffffff", "#0a2a66", "#7ab5e6"),
 ("Mirandés", "MIR", 68, "#e30613", "#ffffff", "#e30613"), ("Racing Santander", "RAC", 71, "#ffffff", "#00843d", "#ffffff"),
 ("Real Zaragoza", "ZAR", 70, "#ffffff", "#0a2a66", "#ffffff"), ("Sporting Gijón", "SPO", 70, "#e30613", "#ffffff", "#e30613"),
 ("Real Valladolid", "VLL", 71, "#5e2b97", "#ffffff", "#5e2b97"), ("Eldense", "ELD", 66, "#0a2a66", "#5e0b15", "#0a2a66"),
]

# --- splice into teams.js ---
start = src.index('// [name, short, rating, shirt, shorts, socks, altShirt, altShorts, altSocks, country?]')
end = src.index('// ============================================================ lookups')
new_block = '// [name, short, rating, shirt, shorts, socks, altShirt, altShorts, altSocks, country?]\nconst C = {\n'
for lid in ['alb', 'ibe', 'pen', 'teu', 'hex', 'afr', 'low', 'lus', 'ana', 'cal', 'bsr', 'pla', 'cam', 'gul', 'row']:
    new_block += block(lid, C[lid])
new_block += '};\n\n// Second-tier leagues (promotion/relegation with the league named in `above`).\n'
new_block += 'C.alb2 = [\n' + ''.join(entry(*c) for c in ALB2) + '];\n'
new_block += 'C.ibe2 = [\n' + ''.join(entry(*c) for c in IBE2) + '];\n\n'
new_block += ('// Clubs from the Americas, Asia and Oceania for the continental club cups and the\n'
              '// club world championship.\nconst ROW_EXTRA = [\n' + ''.join(entry(*c) for c in ROW_EXTRA) + '];\n')
src = src[:start] + new_block + src[end:]
P.write_text(src)
print('clubs replaced OK')
