import json

import pytest

from worker.oracle_tags import read_taxonomy


def write_tags(tmp_path, records):
    path = tmp_path / "tags.jsonl"
    path.write_text("\n".join(json.dumps(record) for record in records))
    return path


def tag(identifier, parents=(), children=(), oracle_ids=()):
    return {
        "object": "tag",
        "type": "oracle",
        "id": identifier,
        "label": "Mutable label",
        "parent_ids": list(parents),
        "child_ids": list(children),
        "taggings": [{"oracle_id": identifier, "weight": "median"} for identifier in oracle_ids],
    }


ROOT = "2f3e4ad7-5e60-41b4-bdbc-653f16869cf6"
CHILD = "b6448c45-ce65-4848-aa98-2151e4e07437"
CARD = "00c0543c-2a1f-4425-8283-4062d74a1637"


def test_descendants_include_self_and_validate_redundant_edges(tmp_path):
    taxonomy = read_taxonomy(
        write_tags(
            tmp_path, [tag(ROOT, children=[CHILD]), tag(CHILD, parents=[ROOT], oracle_ids=[CARD])]
        )
    )
    assert taxonomy.descendants[ROOT] == {ROOT, CHILD}
    assert taxonomy.descendants[CHILD] == {CHILD}


def test_cycle_and_missing_graph_endpoint_are_rejected(tmp_path):
    for records in (
        [
            tag(ROOT, parents=[CHILD], children=[CHILD]),
            tag(CHILD, parents=[ROOT], children=[ROOT]),
        ],
        [tag(ROOT, children=[CHILD])],
    ):
        with pytest.raises(ValueError):
            read_taxonomy(write_tags(tmp_path, records))
