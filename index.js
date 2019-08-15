#!/usr/bin/env node
const monk = require('monk');
const commandLineArgs = require('command-line-args');
const { evaluateFlags, evaluateNodeFlags } = require('./evaluator/evaluate');
const { parseFlags, getCriteriaObject } = require('./evaluator/parser');
const {
    createFlagCollectionObject,
    updateFlagCollection,
    getPartyCriteriaSummary,
    getPartyNodeSummary,
    getContractCriteriaSummary,
    sendCollectionToDB
} = require('./evaluator/collection');
const { createOrgTree, updateOrgTree } = require('./evaluator/tree');

console.time('duration');

const optionDefinitions = [
    { name: 'database', alias: 'd', type: String },
    { name: 'collection', alias: 'c', type: String },
    { name: 'flags', alias: 'f', type: String }, // Name of file containing flag definitions (should always be placed in root folder)
    { name: 'test', alias: 't', type: String }, // Test with one ocid
    { name: 'limit', alias: 'l', type: Number }, // Test with n=limit records
    { name: 'skip', alias: 's', type: Number } // Test with n=limit records
];
const args = commandLineArgs(optionDefinitions);

if(!args.database || !args.collection || !args.flags) {
    console.log('ERROR: missing parameters.');
    process.exit(1);
}

let seenRecords = 0;            // Counter for records read from DB
let seenContracts = 0;          // Counter for contracts extracted from records
let sentContracts = 0;          // Counter for contracts sent to DB
let contractEvaluations = [];
let contractPromises = [];
let partyPromises = [];
const chunkSize = 10000;                // How many documents will be sent to DB at once
const flags = parseFlags(args.flags);   // TODO: Add a syntax check to the flags definition. Should output warnings for rules with errors.
const flagCollectionObj = createFlagCollectionObject(flags);
const partyFlagCollection = [];
const flagCriteriaObj = getCriteriaObject(flags);

let partyScores = {};
let orgTree = createOrgTree();

let query = {};
if(args.test) { // Use the -t flag to test a single record by ocid
    query = { 'records.0.ocid': args.test }
}

const url = 'mongodb://localhost:27017/' + args.database;
const db = monk(url)
.then( (db) => {
    console.log('Connected to ' + args.database + '...');

    const records = db.get(args.collection, { castIds: false });    // Collection to read records from
    const c_flags = db.get('contract_flags', { castIds: false });   // Collection to store contract_flags in
    const p_flags = db.get('party_flags', { castIds: false });      // Collection to store party_flags in

    // Data is not accumulative, clear the collections first to avoid duplicate insertions and errors
    c_flags.remove({});
    p_flags.remove({});

    console.log('Streaming records...');

    let globalCount = 0;
    let skip = 0;
    if(args.test) // Test one record with the -t flag
        globalCount = 1;
    else {
        if(args.limit) // Uses the -l flag to test only the first n=args.limit records
            globalCount = args.limit;
        else // Normal operation
            records.count( query , (error, count) => { globalCount = count } );
        if(args.skip)
            skip = args.skip;
    }

    records.find( query, { limit: globalCount, skip: skip } )
    .each( (record, {close, pause, resume}) => { // Process each record found with query
        seenRecords++;
        let contract = null;
        let evaluations = null;

        // Check if we are working with records or releases
        if( record.hasOwnProperty('records') ) {
            if( record.records.length > 0 ) {
                if( record.records[0].hasOwnProperty('compiledRelease') )
                    contract = record.records[0].compiledRelease;
            }
        }
        else contract = record;

        if( isValidContract(contract) ) {
            evaluations = evaluateFlags(contract, flags, flagCollectionObj); // Perform evaluation of the document
            seenContracts += evaluations.length;
            evaluations.map( (evaluation) => {
                evaluation.contratoFlags.parties.map( (party) => { // Assign contractScore values to all the parties involved
                    updateFlagCollection(party, partyFlagCollection, evaluation.year, evaluation.contratoFlags.flags);
                } );

                // AQUI BANDERAS NODO Y CONFIABILIDAD
                updateOrgTree(orgTree.roots, evaluation.contract);
            } );
            contractEvaluations = contractEvaluations.concat(getContractCriteriaSummary(evaluations, flagCriteriaObj));
        }

        // Cleanup...
        record = null;
        contract = null;
        evaluations = null;

        // If we are testing, stop here and output test results
        if(args.test) {
            console.log('Test results:');
            console.log('----------------------------------------------------');
            console.log('Contract Flags');
            console.log( JSON.stringify(contractEvaluations, null, 4) );
            console.log('----------------------------------------------------');
            console.log('Party Flags');
            console.log( partyFlagCollection );
            console.log('----------------------------------------------------');
            console.log('Org Tree:');
            console.log( JSON.stringify(orgTree, null, 4) );
            console.timeEnd('duration');
            // process.exit(1);
        }

        // Have we collected 10 thousand documents yet? Has the last record been processed?
        if(seenContracts - sentContracts >= chunkSize || seenRecords == globalCount) {
            pause(); // Stop reading contracts for the time being

            // Insert CONTRACT_FLAGS to DB:
            // Split into n=chunkSize chunks
            // Convert flagCollection structure to DB structure
            // Send chunks to DB for insertion
            contractPromises.push(sendCollectionToDB(contractEvaluations, c_flags));
            sentContracts = seenContracts;
            contractEvaluations = [];

            resume(); // Continue reading contracts
        }

        // We have reached the end of the collection, send the last chunk to DB
        if(globalCount == seenRecords) {
            console.log('End streaming. Waiting for inserts...');
            pause(); // Pause until promises are resolved

            // Wait for all promises to be resolved, which means all contract_flags have been sent to DB
            Promise.all(contractPromises).then( (results) => {
                console.log('Insertion complete.');
                console.log('Seen contracts:', seenContracts);

                let inserted = 0;
                results.map( (result) => { // Process result for each chunk sent
                    let json = result.toJSON();
                    inserted += json.nInserted;
                    // if(json.writeErrors) {
                    //     console.log('Errors:');
                    //     json.writeErrors.map( (error) => { console.log(error.errmsg) } );
                    // }
                } )

                console.log('Inserted', inserted);

                // Cleanup...
                contractPromises = null;
                results = null;

                resume(); // Promises complete, continue with the next step
            } )
            .catch( (err) => { console.log('ERROR', err) } );
        }
    } )
    .then( () => { // All contracts have been evaluated and processed, proceed to process all parties
        console.log('Processing parties.');
        const arrayLength = Object.keys(partyFlagCollection).length; // How many parties have we seen?
        let criteriaObj = getCriteriaObject(flags);

        // Calculate PARTY_FLAGS structure
        // Split into n=chunkSize chunks
        // Convert flagCollection structure to DB structure
        let parties = 0;
        let partyChunk = [];
        for(var partyID in partyFlagCollection) {
            parties++;
            partyChunk.push(partyFlagCollection[partyID]);
            delete partyFlagCollection[partyID];

            if(parties % chunkSize == 0 || parties >= arrayLength) {
                let party_flags = getPartyCriteriaSummary(partyChunk, criteriaObj);
                party_flags.map( (party) => {
                    partyScores[party.party.id] = {
                        party: party.party,
                        criteria_score: party.criteria_score,
                        years: party.years
                    };
                } );
                partyChunk = [];
            }
        }

        console.log('Evaluating node flags.');
        let nodeScores = evaluateNodeFlags(orgTree.roots, partyScores);
        // console.log( JSON.stringify(nodeScores, null, 4) );
        console.log('Node flags done.');

        // Insert PARTY_FLAGS to DB:
        // Split into n=chunkSize chunks
        // Send chunks to DB for insertion
        parties = 0;
        partyChunk = [];
        for(var partyID in partyScores) {
            parties++;
            partyChunk.push(partyScores[partyID]);

            if(parties % chunkSize == 0 || parties >= arrayLength) {
                let party_flags = getPartyNodeSummary(partyChunk, nodeScores);
                partyPromises.push(sendCollectionToDB(party_flags, p_flags));
                partyChunk = [];
            }
        }
        console.log('End processing. Waiting for inserts...');
        // Wait for promises to be resolved, which means all parties have been sent to DB
        return Promise.all(partyPromises).then( (results) => {
            console.log('Insertion complete.');
            console.log('Seen parties:', parties);

            let inserted = 0;
            results.map( (result) => { // Process result for each chunk sent
                let json = result.toJSON();
                inserted += json.nInserted;
            } )

            console.log('Inserted', inserted);

            // Cleanup...
            partyPromises = null;
            results = null;
        } )
        .catch( (err) => { console.log('ERROR', err) } );
    } )
    .then( () => {
        console.timeEnd('duration');
        process.exit(0); // All done!
    } ).
    catch( (err) => { console.log('Error:', err); process.exit(1); } );
} )
.catch( (err) => { console.log('Error connecting to ' + args.database, err); process.exit(1); } );

function isValidContract(contract) {
    return contract.hasOwnProperty('parties') && contract.hasOwnProperty('contracts');
}
