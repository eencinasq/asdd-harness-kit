# Test fixture for python.yml (semgrep --test). Never scanned as code: it violates the rules on purpose.
import os
import pickle
import subprocess

import yaml


def handlers(request, cur):
    # ruleid: security.py.shell-injection
    subprocess.run("ls " + request.args["dir"], shell=True)
    # ruleid: security.py.shell-injection
    os.system(request.args["cmd"])
    # ok: security.py.shell-injection
    subprocess.run(["ls", request.args["dir"]])

    # ruleid: security.py.unsafe-deserialization
    pickle.loads(request.data)
    # ruleid: security.py.unsafe-deserialization
    yaml.load(request.data)
    # ok: security.py.unsafe-deserialization
    yaml.load(request.data, Loader=yaml.SafeLoader)

    # ruleid: security.py.code-injection
    eval(request.args["expr"])
    # ok: security.py.code-injection
    eval("1 + 1")

    # ruleid: security.py.sql-injection
    cur.execute(f"SELECT * FROM users WHERE id = {request.args['id']}")
    # ok: security.py.sql-injection
    cur.execute("SELECT * FROM users WHERE id = %s", (request.args["id"],))
