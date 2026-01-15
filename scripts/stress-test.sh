#!/bin/bash
# Stress test runner script
# Generates a test token and runs Artillery stress tests

set -e

echo "Generating test token..."
TEST_TOKEN=$(npm run --silent token:auditor)
export TEST_TOKEN

echo "Running stress tests..."
echo ""

# Check which config to use
CONFIG=${1:-smoke}

if [ "$CONFIG" == "full" ]; then
    echo "Running FULL stress test (4+ minutes)..."
    npx artillery run test/stress/stress.yml --output test/stress/report.json
else
    echo "Running SMOKE test (quick validation)..."
    npx artillery run test/stress/smoke.yml --output test/stress/report.json
fi

echo ""
echo "Stress test complete!"
echo "Report saved to test/stress/report.json"
echo ""
echo "To view HTML report:"
echo "  npx artillery report test/stress/report.json"
