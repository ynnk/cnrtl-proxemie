#CELLO LibJS dep
LIBJS_DIR=./cello_libjs
LIBJS_ORIGIN=ssh://192.168.122.99/var-hdd/git/cello_libjs/
LIBJS_VERSION=master

.PHONY: get_libjs link_libjs python_dep

all_dep: get_libjs python_dep

get_libjs:
	rm -rf ${LIBJS_DIR}
	git clone --no-checkout ${LIBJS_ORIGIN} ${LIBJS_DIR}
	cd ${LIBJS_DIR} && git checkout -f ${LIBJS_VERSION}
	cd ${LIBJS_DIR} && make build

link_libjs:
	rm -rf ${LIBJS_DIR}
	ln -s  ../cello_libjs/ ${LIBJS_DIR}

python_dep:
	pip install -r requirements.txt

## Force the re-install of cello
cello_dep_force:
	pip install -I `cat requirements.txt |grep git/cello`
