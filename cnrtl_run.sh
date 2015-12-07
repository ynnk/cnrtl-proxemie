#!/bin/bash
## Run CNRTL throw gunicorn

#set -x  #log all execed lin for debug
set -e
BASEDIR=/var/wwwapps/cnrtl/
APPMODULE=naviprox_cnrtl
APPNAME=app

# log
LOGFILE=$BASEDIR/log/cnrtl.log 
LOGDIR=$(dirname $LOGFILE)
LOGLEVEL=debug

# gunicorn config
BIND=0.0.0.0:8042
NUM_WORKERS=3

# user/group to run as
USER=wwwapps
GROUP=wwwapps

## start the app
cd $BASEDIR
# if  virtualenv is used 
source ./venv/bin/activate


#pre-start script
# create log dir if not exist
test -d $LOGDIR || mkdir -p $LOGDIR
#end script

# run the gunicorn server
exec gunicorn --workers $NUM_WORKERS --bind=$BIND\
    --user=$USER --group=$GROUP --log-level=$LOGLEVEL \
    --log-file=$LOGFILE $APPMODULE:$APPNAME #2>>$LOGFILE
