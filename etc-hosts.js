'use strict'

const dnsJack = require('./index.js');
const fs = require('fs');
const readline = require('readline');
const dns = require('dns');

const publicIP = {};
require('os').networkInterfaces()['en0'].forEach((cfg) => {
  publicIP[cfg.family] = cfg.address;
});

const bump = (hosts) => new Promise((resolve, reject) => {
  let cfg = {};
  fs.exists(hosts, function(exists){
    if(exists){

      readline.createInterface({
        input: fs.createReadStream(hosts, {
          flags: 'r',
          encoding: 'utf-8',
          autoClose: true
        })
      })
      .on('line', (line) => {
        let tokens, ip, family;
        if (!/^#/.test(line) && (tokens = line.split(/\b\s+\b/)).length > 1 ){
          ip = tokens.shift();
          family = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) ? 'IPv4' : 'IPv6';
          tokens.forEach((hostname)=>{
            cfg[`${family}-${hostname}`] = ip;
          });
        }
      })
      .on('close', () => {
        resolve(cfg);
      });
    } else {
      reject(1);
    }
  });
});

bump('/etc/hosts')
.then((cfg) => {
  console.log(cfg);
  let proxyDNS = dnsJack.createServer();

  proxyDNS.route(function(data, callback) {

    let lookupDomain = `${data.rinfo.family}-${data.domain}`;
    if (cfg.hasOwnProperty(lookupDomain)){

      let realIP = cfg[lookupDomain];
      switch(realIP){
        case '::1':
        realIP = publicIP['IPv6'];
        break;

        case '127.0.0.1':
        realIP = publicIP['IPv4'];
        break;

        default:
      }

      console.log(data.domain, realIP);
      callback(null, realIP);
    } else {
      dns.lookup(data.domain, { family:data.rinfo.family==='IPv4'?4:6 }, (err, address)=>{
        console.log(data.domain, err, address);
        callback(null, {ip: address});
      });
    }

  });

  proxyDNS.listen();
})
.catch((err) => {
  console.log(err);
});
