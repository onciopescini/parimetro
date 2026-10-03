#!/usr/bin/env python3
"""Espone `ogr2ogr` come vero eseguibile su Windows, inoltrando a Docker.

Serve a far girare 01_import_boundaries.py senza installare OSGeo4W. Lo script
chiama ogr2ogr con subprocess.run(["ogr2ogr", ...]): su Windows CreateProcess
sa eseguire solo .exe, non .cmd, quindi lo shim viene installato da pip come
console script (pip genera un .exe reale in Scripts/).

Ogni argomento che è un file esistente sul disco viene montato in /dataN e
sostituito col percorso interno al container; gli altri (la stringa PG:,
EPSG:4326, i flag) passano intatti.
"""
import os
import subprocess
import sys

IMAGE = "ghcr.io/osgeo/gdal:alpine-small-latest"


def main() -> int:
    args = sys.argv[1:]
    mounts: dict[str, str] = {}
    rewritten: list[str] = []

    for arg in args:
        if os.path.isfile(arg):
            src = os.path.dirname(os.path.abspath(arg))
            if src not in mounts:
                mounts[src] = f"/data{len(mounts)}"
            rewritten.append(f"{mounts[src]}/{os.path.basename(arg)}")
        else:
            rewritten.append(arg)

    cmd = ["docker", "run", "--rm"]
    for host, dest in mounts.items():
        cmd += ["-v", f"{host}:{dest}:ro"]
    cmd += [IMAGE, "ogr2ogr"] + rewritten

    # Il comando non viene stampato: conterrebbe la password del DB in chiaro.
    print(f"[shim] ogr2ogr via Docker · {len(mounts)} volume/i montato/i", flush=True)
    return subprocess.run(cmd).returncode


if __name__ == "__main__":
    sys.exit(main())
