curl -X POST "https://stream.xircular.io/events/executive-assigned/list" \
-H "Content-Type: application/json" \
-H "Accept: application/json" \
-d '{
    "user":{"id":"70a1edec-9a3f-433f-9988-5f5403de1415"},
    "page": 1,
    "limit": 10,
    "attributes": ["id"],
    "include": ["Events","ConferenceTalks","Workshops","ExhibitorBrands"],
    "where": {}
}'

