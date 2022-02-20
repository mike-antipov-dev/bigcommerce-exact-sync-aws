# BigCommerce to Exact Sync Microservice

This AWS Lambda based microservice consist of two Lambda functions: 
1. One that refreshes access token once in 10 minutes (which is a must). 
2. The actual sync function.