'use strict'

const RPC = require('@hyperswarm/rpc')
const DHT = require('hyperdht')
const Hypercore = require('hypercore')
const Hyperbee = require('hyperbee')
const crypto = require('crypto')

const main = async () => {
  // hyperbee db
  const hcore = new Hypercore('./db/rpc-client')
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
    port: 50001,
    keyPair: DHT.keyPair(dhtSeed),
    bootstrap: [{ host: '127.0.0.1', port: 30001 }] // note boostrap points to dht that is started via cli
  })
  await dht.ready()

  // public key of rpc server, used instead of address, the address is discovered via dht
  const serverPubKey = Buffer.from(process.argv[2], 'hex')

  // rpc lib
  const rpc = new RPC({ dht })

  // payload for request
  // const payload = { nonce: 126 }
  // const payloadRaw = Buffer.from(JSON.stringify(payload), 'utf-8')

  // sending request and handling response
  // see console output on server code for public key as this changes on different instances
  // const respRaw = await rpc.request(serverPubKey, 'ping', payloadRaw)
  // const resp = JSON.parse(respRaw.toString('utf-8'))
  // console.log(resp) // { nonce: 127 }


  // Example usage of getLatestPrices
  const latestPricesPayload = { pairs: ['btc', 'eth'] };
  const latestPricesPayloadRaw = Buffer.from(JSON.stringify(latestPricesPayload), 'utf-8');
  const latestPricesRespRaw = await rpc.request(serverPubKey, 'getLatestPrices', latestPricesPayloadRaw);
  const latestPricesResp = JSON.parse(latestPricesRespRaw.toString('utf-8'));
  console.log('Latest Prices:', latestPricesResp);

  // Example usage of getHistoricalPrices
  const historicalPricesPayload = { pairs: ['btc', 'eth'], from: Date.now() - 2 * 24 * 60 * 60 * 1000, to: Date.now() }; // Last 24 hours
  // const historicalPricesPayload = { pairs: ['btc', 'eth'], from: Date.now() -  24 * 60 * 60 * 1000, to: Date.now() }; // Last 24 hours
  const historicalPricesPayloadRaw = Buffer.from(JSON.stringify(historicalPricesPayload), 'utf-8');
  const historicalPricesRespRaw = await rpc.request(serverPubKey, 'getHistoricalPrices', historicalPricesPayloadRaw);
  const historicalPricesResp = JSON.parse(historicalPricesRespRaw.toString('utf-8'));
  console.log('Historical Prices:', historicalPricesResp);

  // closing connection
  await rpc.destroy()
  await dht.destroy()
}

main().catch((e) => {
  console.log(e);
})