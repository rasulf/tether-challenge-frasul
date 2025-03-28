'use strict'

const RPC = require('@hyperswarm/rpc')
const DHT = require('hyperdht')
const Hypercore = require('hypercore')
const Hyperbee = require('hyperbee')
const crypto = require('crypto')
const axios = require('axios')
require('dotenv').config();
const stub = require('../stubs.js');

const main = async () => {
  // hyperbee db
  const hcore = new Hypercore('./db/rpc-server')
  const hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
  await hbee.ready()

  // resolved distributed hash table seed for key pair
  let dhtSeed = (await hbee.get('dht-seed'))?.value
  if (!dhtSeed) {
    // not found, generate and store in db
    dhtSeed = crypto.randomBytes(32)
    await hbee.put('dht-seed', dhtSeed)
  }

  // start distributed hash table, it is used for rpc service discovery
  const dht = new DHT({
    port: 40001,
    keyPair: DHT.keyPair(dhtSeed),
    bootstrap: [{ host: '127.0.0.1', port: 30001 }] // note boostrap points to dht that is started via cli
  })
  await dht.ready()

  // resolve rpc server seed for key pair
  let rpcSeed = (await hbee.get('rpc-seed'))?.value
  if (!rpcSeed) {
    rpcSeed = crypto.randomBytes(32)
    await hbee.put('rpc-seed', rpcSeed)
  }

  // setup rpc server
  const rpc = new RPC({ seed: rpcSeed, dht })
  const rpcServer = rpc.createServer()
  await rpcServer.listen()
  console.log('rpc server started listening on public key:', rpcServer.publicKey.toString('hex'))

  // Function to fetch and process crypto data
  const fetchAndStoreCryptoData = async () => {
    try {
      const axiosConfig = {
        headers: {
          'x_cg_demo_api_key': process.env.COINGECKO_API_KEY,
          'Accept': 'application/json'
        }
      };
      const fetchTopCoinsUrl = new URL('https://api.coingecko.com/api/v3/coins/markets');
      fetchTopCoinsUrl.searchParams.append('vs_currency', 'usd');
      fetchTopCoinsUrl.searchParams.append('order', 'market_cap_desc');
      fetchTopCoinsUrl.searchParams.append('per_page', 5);
      fetchTopCoinsUrl.searchParams.append('page', 1);
      fetchTopCoinsUrl.searchParams.append('sparkline', 'false');

      const response = await axios.get(fetchTopCoinsUrl, axiosConfig);
      const coins = response.data;
      // const coins = stub.coins;

      const exchangesUrl = `https://api.coingecko.com/api/v3/exchanges`;
      const exchangesResponse = await axios.get(exchangesUrl, axiosConfig);
      const top3Exchanges = exchangesResponse.data.sort((a, b) => (b.trust_score - a.trust_score)).slice(0,3);
      // todo: use trust score rank

      let exchanges = [];
      for (let exchange of top3Exchanges) {
        const fetchTickersUrl = new URL(`https://api.coingecko.com/api/v3/exchanges/${exchange.id}/tickers`);
        fetchTickersUrl.searchParams.append('coin_ids', coins.map(coin => coin.id).join());
        const tickersResponse = await axios.get(fetchTickersUrl, axiosConfig);
        const priceAgainstUSDT = tickersResponse.data.tickers.filter(t => coins.map(coin => coin.symbol.toUpperCase()).includes(t.base) && t.target === 'USDT');
        exchanges = exchanges.concat(priceAgainstUSDT);
      }
      // exchanges = stub.exchanges;
      for (let coin of coins) {
        let totalPrice = 0;
        let exchangeData = [];
        const exchangesForThisCoin = exchanges.filter(t => t.base === coin.symbol.toUpperCase());
        if (exchangesForThisCoin.length === 0) {
          continue;
        }
        exchangesForThisCoin.forEach(t => {
          totalPrice = totalPrice + t.last;
          exchangeData.push({
            exchange: t.market.name,
            price: t.last
          });
        });
        const averagePrice = totalPrice / exchangesForThisCoin.length;

        // Store data in Hyperbee
        const timestamp = Date.now();
        const hbeeKey = `${coin.symbol}-${timestamp.toString()}`;
        await hbee.put(hbeeKey, JSON.stringify({
          symbol: coin.symbol,
          price: averagePrice,
          exchanges: exchangeData,
          timestamp: timestamp,
        }));
        // console.log(hbeeKey);
      }
      console.log('Crypto data fetched and stored successfully.');
    } catch (error) {
      console.error('Error fetching or storing crypto data:', error);
    }
  };


  // RPC methods
  rpcServer.respond('getLatestPrices', async (reqRaw) => {
    const req = JSON.parse(reqRaw.toString('utf-8'));
    const { pairs } = req;

    // let lastCurrenciesBatch = [];
    // for await (const data of hbee.createReadStream({ reverse: true, limit: 5, gte: `${pairs[0]}-${Date.now()}`})) {
    //   const latestKey = data.key;
    //   if (latestKey) {
    //   let data = await hbee.get(latestKey);
    //   if (data && data.value) {
    //     lastCurrenciesBatch.push(JSON.parse(data.value));
    //   }
    // }
    // }
    // lastCurrenciesBatch = lastCurrenciesBatch.filter((d => pairs.includes(d.symbol)));
    // return Buffer.from(JSON.stringify(lastCurrenciesBatch), 'utf-8');

    const latestPrices = {};
    for (const pair of pairs) {

      const latestKeyData = await new Promise((resolve, reject) => {
        const stream = hbee.createHistoryStream({ reverse: true });
        let found = false;
        stream
          .on('data', (data) => {
            if (data.key.startsWith(`${pair}-`)) {
              resolve(data);
              stream.destroy();
              found = true;
            }
          })
          .on('error', reject)
          .on('end', () => {
            if (!found) {
              resolve(null);
            }
          });
      });
      
      if (latestKeyData && latestKeyData.key) {
        const data = await hbee.get(latestKeyData.key);
        if (data && data.value) {
          latestPrices[pair] = JSON.parse(data.value.toString());
        }
      }
    }
    return Buffer.from(JSON.stringify(latestPrices), 'utf-8');
  });

  rpcServer.respond('getHistoricalPrices', async (reqRaw) => {
    const req = JSON.parse(reqRaw.toString('utf-8'));
    const { pairs, from, to } = req;
    const historicalPrices = {};

    for (const pair of pairs) {
      historicalPrices[pair] = [];
      for await (let { value } of hbee.createReadStream({ gte: `${pair}-${from}`, lte: `${pair}-${to}` })) {
        value = JSON.parse(value.toString());
        historicalPrices[pair].push(value);
      }
    }
    return Buffer.from(JSON.stringify(historicalPrices), 'utf-8');
  });

  // bind handlers to rpc server
  rpcServer.respond('ping', async (reqRaw) => {
    // reqRaw is Buffer, we need to parse it
    const req = JSON.parse(reqRaw.toString('utf-8'))

    const resp = { nonce: req.nonce + 1 }

    // we also need to return buffer response
    const respRaw = Buffer.from(JSON.stringify(resp), 'utf-8')
    return respRaw
  })

  // Schedule data fetching every 5 minnutes
  setInterval(fetchAndStoreCryptoData, 5 * 60 * 1000);

  // Initial data fetch
  await fetchAndStoreCryptoData();
  
}

main().catch((e) => {
  console.log(e);
})