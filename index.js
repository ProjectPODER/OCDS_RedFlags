#!/usr/bin/env node
const monk = require('monk');
const commandLineArgs = require('command-line-args');
const evaluateFlags = require('./evaluator/evaluate');
const { parseFlags, getCriteriaObject } = require('./evaluator/parser');
const {
    createFlagCollectionObject,
    updateFlagCollection,
    getPartyCriteriaSummary,
    getContractCriteriaSummary,
    sendPartyCollectionToDB,
    sendContractCollectionToDB
} = require('./evaluator/collection');

const optionDefinitions = [
    { name: 'database', alias: 'd', type: String },
    { name: 'collection', alias: 'c', type: String },
    { name: 'flags', alias: 'f', type: String },
    { name: 'test', alias: 't', type: String }
];
const args = commandLineArgs(optionDefinitions);

if(!args.database || !args.collection || !args.flags) {
    console.log('ERROR: missing parameters.');
    process.exit(1);
}

let seenContracts = 0;
const flags = parseFlags(args.flags); // Add a syntax check to the flags definition. Should output warnings for rules with errors.
const flagCollectionObj = createFlagCollectionObject(flags);
const contractFlagCollection = [];
const partyFlagCollection = [];
const partyFlagIndex = [];

let query = {};
if(args.test) {
    query = { 'records.0.ocid': args.test }
}

// Connection URL
const url = 'mongodb://localhost:27017/' + args.database;
const db = monk(url)
.then( (db) => {
    // console.log('Connected to ' + args.database + '...');
    console.time('duration');

    const records = db.get(args.collection, { castIds: false });

    // console.log('Streaming records...');

    records.find( query, { limit: 10000 } )
    .each( (record, {close, pause, resume}) => {
        seenContracts++;
        let contract = null;

        // Check if we are working with records or releases
        if( record.hasOwnProperty('records') ) {
            if( record.records.length > 0 ) {
                if( record.records[0].hasOwnProperty('compiledRelease') )
                    contract = record.records[0].compiledRelease;
            }
        }
        else contract = record;

        if( isValidContract(contract) ) {
            // console.log(seenContracts, contract.ocid);
            // Perform evaluation of the document
            let evaluations = evaluateFlags(contract, flags, flagCollectionObj);

            evaluations.map( (evaluation) => {
                contractFlagCollection.push(evaluation.contratoFlags);
                // Assign contractScore values to all the parties involved
                evaluation.contratoFlags.parties.map( (party) => {
                    updateFlagCollection(party, partyFlagCollection, partyFlagIndex, evaluation.year, evaluation.contratoFlags.flags);
                } );
            } );
        }
        record = null;
        contract = null;
    } )
    .then( () => {
        if(seenContracts == 0) {
            console.log('No contracts seen.');
            process.exit(0);
        }
        // process.exit(1);
        // -----------------------------------------------------------------------------------------
        // -----------------------------------------------------------------------------------------

        // SEGUNDA PASADA VA AQUI

        // -----------------------------------------------------------------------------------------
        // -----------------------------------------------------------------------------------------

        // Insertar PARTY_FLAGS a la DB:
        // Dividir el array en chunks de 10000, para cada chunk se convierte la data en el objeto para
        // la DB, luego se envía el listado de objetos para insert/update en la DB
        const chunkSize = 10000;
        var numChunks = 0;
        var upsertedChunks = 0;
        var totalModified = 0;
        var totalUpserted = 0;

        var arrayLength = partyFlagCollection.length;
        var expectedChunks = Math.floor(arrayLength / chunkSize) + 1;
        var criteriaObj = getCriteriaObject(flags);
        var dbCollection = db.get('party_flags', { castIds: false });

        for(i = 0; i < arrayLength; i += chunkSize) {
            numChunks++;
            console.log('PARTIES Chunk ' + numChunks);

            var partyChunk = partyFlagCollection.slice(i, i + chunkSize);
            var party_flags = getPartyCriteriaSummary(partyChunk, criteriaObj);

            // Send chunk to DB...
            var upsertPromises = sendPartyCollectionToDB(party_flags, dbCollection);
            // console.log(JSON.stringify(party_flags, null, 4));
            Promise.all([upsertPromises]).then((results) => {
                upsertedChunks++;
                console.log('---------------------------------------------------------------------------');
                console.log('RESULT for chunk ' + upsertedChunks);
                console.log('MODIFIED:', results[0].modifiedCount, 'UPSERTED:', results[0].upsertedCount);

                totalModified += results[0].modifiedCount;
                totalUpserted += results[0].upsertedCount;

                if(upsertedChunks == expectedChunks) {
                    console.log('---------------------------------------------------------------------------');
                    console.log('PARTY_FLAGS: DONE!');
                    console.log('MODIFIED:', totalModified, 'UPSERTED:', totalUpserted);
                    console.log('---------------------------------------------------------------------------');

                    // Insertar CONTRACT_FLAGS a la DB:
                    // Dividir el array en chunks de 1000, para cada chunk se convierte la data en el objeto para
                    // la DB, luego se envía el listado de objetos para insert/update en la DB
                    numChunks = 0;
                    upsertedChunks = 0;
                    totalModified = 0;
                    totalUpserted = 0;

                    arrayLength = contractFlagCollection.length;
                    expectedChunks = Math.floor(arrayLength / chunkSize) + 1;
                    criteriaObj = getCriteriaObject(flags);
                    dbCollection = db.get('contract_flags', { castIds: false });

                    for(i = 0; i < arrayLength; i += chunkSize) {
                        numChunks++;
                        console.log('CONTRACTS Chunk ' + numChunks);

                        var contractChunk = contractFlagCollection.slice(i, i + chunkSize);
                        var contract_flags = getContractCriteriaSummary(contractChunk, criteriaObj);

                        // Send chunk to DB...
                        var upsertPromises = sendContractCollectionToDB(contract_flags, dbCollection);
                        // console.log(JSON.stringify(party_flags, null, 4));
                        Promise.all([upsertPromises]).then((results) => {
                            upsertedChunks++;

                            console.log('---------------------------------------------------------------------------');
                            console.log('RESULT for chunk ' + upsertedChunks);
                            console.log('INSERTED:', results[0].nInserted);

                            totalUpserted += results[0].nInserted;

                            if(upsertedChunks == expectedChunks) {
                                console.log('---------------------------------------------------------------------------');
                                console.log('CONTRACT_FLAGS: DONE!');
                                console.log('INSERTED:', totalUpserted);
                                console.log('---------------------------------------------------------------------------');

                                console.log(contractFlagCollection.length + ' contratos procesados.');
                                console.log(partyFlagCollection.length + ' entidades procesadas.');
                                console.timeEnd('duration');

                                // ------------- THE END -------------
                                process.exit(0);
                                // ------------- THE END -------------
                            }
                        }).catch(e => { console.log('PROMISE ERROR', e) }); // END CONTRACT PROMISES
                    }
                }
            }).catch(e => { console.log('PROMISE ERROR', e) }); // END PARTY PROMISES
        }

        console.log('End streaming.');
    } );
} )
.catch( (err) => { console.log('Error connecting to ' + args.database, err) } );

function isValidContract(contract) {
    return contract.hasOwnProperty('parties') && contract.hasOwnProperty('contracts');
}
