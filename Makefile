SHELL := /bin/bash

venv: venv/envinit

venv/envinit: requirements.txt
	test -d venv || python3 -m venv venv

	source ./venv/bin/activate; \
	pip install -r requirements.txt

	cd ./js; npm ci && npm run build

	touch venv/envinit

run: venv
	./run.sh

clean:
	rm -rf venv
	find -iname "*.pyc" -delete

start:
	docker compose up -d

stop:
	docker compose down