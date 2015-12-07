# Proxemie pour le CNRTL

## Run it (dev)

    $ virtualenv venv --system-site-packages
    $ source venv
    $ pip install -r requirements.txt
    $ python naviprox_cnrtl.py

Then navigate to http://localhost:5000/proxemie/causer

## Notes

!! Change git remote !! 

$ git remote remove origin
$ git remote add origin git@git.kodexlab.com:kodexlab/cnrtl.git
$ git remote -v
origin	git@git.kodexlab.com:kodexlab/cnrtl.git (fetch)
origin	git@git.kodexlab.com:kodexlab/cnrtl.git (push)

