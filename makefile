.PHONY: install

install: pip graphs

pip:
	pip install -r requirements.txt

graphs:
	echo "Please install graphs into Graphs/dicosyn/dicosyn/"
	echo "A.dicosyn.pickle"
	echo "N.dicosyn.pickle"
	echo "V.dicosyn.pickle"
