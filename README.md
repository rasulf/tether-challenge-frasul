# tether-challenge-frasul

- Data Collection
  - I have put the private key in the .env, but I have checked it in too so that reviewers can run this code. I am unhappy because this is a public repository.
  - I first use the /coins/markets endpoint to get the top 5 cryptocurrencies according to coingecko
  - Then I get a list of exchanges using the /exchanges endpoint
  - Then I sort the exchanges by trust score, to get the 'top 3 exchanges according to coingecko'
  - Then I use the /tickers endpoint to get data from all the 3 exchanges. This endpoint is limited and does not have queries to slecetively get data.
- Data Preprocessing and Transformation
- With the /tickers result, I need to now extract data by mapping the coin information to the ticker result, and only extracting values where USDT is the 'target'
- Data storage
  - For each of the 5 coins, I store the data in hyperbee.
  - I choose the hyperbee key to be a combination of the coin name and the timestamp. This will help me later retreving keys within specific ranges.
- Scheduling and Automation:
  - I use a setTimeout to update and store all coin prices from the 3 exchanges every 5 minutes.
  - I use hyperswarm/rpc to create endpoints getLatestPrices & getHistoricalPrices that can be invoked via any client.
  - I log the public key of my 'server' hypercore and use that in clients to connect to this peer.
- Data exposure
    - getLatestPrices (pairs: string[]) - goes over in reverse over the latest keys stored in hyperbee. returns the value for all the keys mentioned in the 'pairs' argument and completes.
    - getHistoricalPrices (pairs: string[], from: number, to: number) - takes advantage of hyperbee's createReadStream Api's sequence indexing by specifying the 'gte' and 'lte' options. This leverages the key naming principle from earlier and gives values only for keys within the date range sepcified in the function's argument.

# Things I could not finish:
- Given more time, I need to clean up the code. I need to modularize it. I would move all the data collection to a separate module modules/cryptoData.js that fetches price for top 5 coins from top 3 exchanges every time it is invoked.
  - I would then create a modules/hyperbeeUtils.js to store the result in hyperbee.
  - I would extract out the seeding logic into modules/dhtUtils.js which would be responsible for initializing and seeiding Hypercore, Hyperswarm.
  - I would finally have a modules/rpcHandlers.js that would drive the modules.
- Add error handles and retries
  - There is no error handling for the rpc handlers. The error logging for coingecko calls is very limited.
- Remove the .env. I have it checked in right now!
- Better variable names - I went with var names that could be better.
- I am storing the value in Hyperbee as a stringified JSON. This requires parsing everytime it is read. Ideally, I would destructure and store the json.  
