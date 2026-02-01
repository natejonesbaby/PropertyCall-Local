#!/bin/bash

echo "Testing Feature #190: Queue Pause/Resume Functionality"
echo "======================================================"

# Test 1: Get initial queue status (should be not paused by default)
echo ""
echo "Test 1: Get initial queue status"
curl -s http://localhost:3000/api/queue/status \
  -H "Authorization: Bearer $(grep token test-token.txt 2>/dev/null || echo 'test')" \
  | jq '.'
echo ""

# Test 2: Pause the queue
echo ""
echo "Test 2: Pause the queue"
curl -s -X POST http://localhost:3000/api/queue/pause \
  -H "Authorization: Bearer $(grep token test-token.txt 2>/dev/null || echo 'test')" \
  -H "Content-Type: application/json" \
  | jq '.'
echo ""

# Test 3: Verify queue is paused
echo ""
echo "Test 3: Verify queue is paused"
curl -s http://localhost:3000/api/queue/status \
  -H "Authorization: Bearer $(grep token test-token.txt 2>/dev/null || echo 'test')" \
  | jq '.'
echo ""

# Test 4: Resume the queue
echo ""
echo "Test 4: Resume the queue"
curl -s -X POST http://localhost:3000/api/queue/resume \
  -H "Authorization: Bearer $(grep token test-token.txt 2>/dev/null || echo 'test')" \
  -H "Content-Type: application/json" \
  | jq '.'
echo ""

# Test 5: Verify queue is resumed
echo ""
echo "Test 5: Verify queue is resumed"
curl -s http://localhost:3000/api/queue/status \
  -H "Authorization: Bearer $(grep token test-token.txt 2>/dev/null || echo 'test')" \
  | jq '.'
echo ""

echo "======================================================"
echo "Tests complete!"
