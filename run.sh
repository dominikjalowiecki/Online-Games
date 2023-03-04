#!/bin/bash

source ./venv/bin/activate

celery -A tasks worker --autoscale=10,0 & PID=$!

trap "kill $PID" SIGINT

python online-games.py

wait $PID