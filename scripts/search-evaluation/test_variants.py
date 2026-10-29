"""Pure contract checks. Actual PostgreSQL execution belongs to the harness."""
import unittest

from variants import DIMENSIONS, _fuse, _query, _result, _tokens, _tsquery, _vector_literal, search


class VariantTests(unittest.TestCase):
    def test_safe_tokens_and_prefix(self):
        tokens = _tokens("  Sol's ring | !tap:* <-> 2; DROP TABLE --")
        self.assertEqual(tokens, ['sol', 's', 'ring', 'tap', '2', 'drop', 'table'])
        self.assertEqual(_tsquery(['tap', '2'], completion=True), "'tap' & '2'")
        self.assertEqual(_tsquery(['untap'], completion=True), "'untap':*")
        self.assertEqual(_tsquery(['ring'], completion=False), "'ring'")
        self.assertEqual(_tsquery([], completion=True), '')
        self.assertEqual(_tokens('"Äther" 日本語'), ['äther', '日本語'])

    def test_query_cap(self):
        self.assertEqual(_query('  sol  '), 'sol')
        for query in ('x' * 301, '😀' * 151, None):
            with self.assertRaises(ValueError):
                _query(query)

    def test_empty_and_unknown(self):
        for query in ('', ' \t ', "!!! :* & '"):
            self.assertEqual(search(None, 'lexical', query), [])
        self.assertEqual(search(None, 'baseline', ''), [])
        with self.assertRaises(ValueError):
            search(None, 'other', '')
        for limit in (-1, 101, True, 1.5):
            with self.assertRaises(ValueError):
                search(None, 'lexical', '', limit=limit)

    def test_embedding_required_even_for_empty_input(self):
        for variant in ('vector', 'hybrid'):
            with self.assertRaisesRegex(ValueError, 'precomputed'):
                search(None, variant, '')
        for embedding in ([], [0.0] * DIMENSIONS, [float('nan')] * DIMENSIONS,
                          [float('inf')] * DIMENSIONS, [True] * DIMENSIONS):
            with self.assertRaises(ValueError):
                _vector_literal(embedding)
        self.assertTrue(_vector_literal([1.0] * DIMENSIONS).startswith('[1.0,'))

    def test_rrf_exact_protection_and_sources(self):
        lexical = [dict(id='b', exact=True, reason='name'), dict(id='a', reason='rule text')]
        vector = [dict(id='a', reason='semantic'), dict(id='c', reason='semantic')]
        result = _fuse(lexical, vector)
        self.assertEqual([r['id'] for r in result], ['b', 'a', 'c'])
        self.assertGreater(result[1]['score'], result[0]['score'])
        self.assertEqual(result[1]['reason'], 'rule text + semantic')
        self.assertNotIn('score', lexical[0])
        self.assertEqual([r['id'] for r in _fuse([dict(id='z', reason='name')],
                          [dict(id='a', reason='semantic')])], ['a', 'z'])
        self.assertEqual(_fuse([], []), [])

    def test_href_preserves_identity_and_escapes_name(self):
        row = _result(dict(id='abc', name='Fire // Ice &', score=1, reason='name'))
        self.assertIn('oracle_id=abc', row['href'])
        self.assertIn('%26', row['href'])
        self.assertEqual(row['kind'], 'card')
        selected = _result(dict(id='abc', name='Fire', score=1,
                                document={'id': 'printing-id'}))
        self.assertIn('printing=printing-id', selected['href'])


if __name__ == '__main__':
    unittest.main()
