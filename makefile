.PHONY: install

install:
	pip install -r requirements.txt

graphs:
	mkdir -p Graphs/dicosyn/dicosyn/
	scp 192.168.122.99://var-hdd/hubic_proxteam/Graphs/dicosyn/dicosyn/N.dicosyn.pickle Graphs/dicosyn/dicosyn/
	scp 192.168.122.99://var-hdd/hubic_proxteam/Graphs/dicosyn/dicosyn/A.dicosyn.pickle Graphs/dicosyn/dicosyn/
	scp 192.168.122.99://var-hdd/hubic_proxteam/Graphs/dicosyn/dicosyn/V.dicosyn.pickle Graphs/dicosyn/dicosyn/
