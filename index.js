const { ApolloServer, gql, PubSub } = require('apollo-server');
const _ = require('lodash');
const axios = require('axios');
const accountSid = "AC181b8f67ebe5424f20f07d445e234a56";
const authToken = "99f5079432895a32906fd5735ca02e0e";
const client = require('twilio')(accountSid, authToken);
const pubsub = new PubSub();
let sampleNoti = {
    centers: [
        {
            center_id: 553422,
            name: 'Barbil CHC',
            address: 'Barbil',
            state_name: 'Odisha',
            district_name: 'Kendujhar',
            block_name: 'Joda',
            pincode: 758035,
            lat: 22,
            long: 85,
            from: '09:00:00',
            to: '18:00:00',
            fee_type: 'Free',
            sessions: [Array]
        }
    ]
}
const typeDefs = gql`

    type Query {
        fetchPermissions: [PermissionsResponse]
        fetchSlotAvailability(date: String!): FetchSlotAvailability
    }
    type Mutation{
        updatePermission(input:UpdatePermissionRequest!) : String
        updateSlot : String
    }
    type Subscription{
        notifyPermissionUpdate:[PermissionsResponse]
        notifySlotAvailability(date : String!) : FetchSlotAvailability
    }
    input UpdatePermissionRequest {
        name: String
        availability: Boolean
    }
    type PermissionsResponse{
        name: String
        availability: Boolean
    }
    type FetchSlotAvailability {
        centers : [Centers]
    }
    type Centers {
        center_id: Float
        name: String
        sessions: [Sessions]
    }
    type Sessions {
        session_id: String
        min_age_limit: Int
        available_capacity: Int
        vaccine: String
        slots: [String]
        available_capacity_dose1: String
        available_capacity_dose2: String
        date: String
    }
`;

const resolvers = {
    Query: {
        fetchPermissions: (root, args, context) => {
            return permissions;
        },
        fetchSlotAvailability: (root, args, context) => {
            return fetchSlotAvailability(args);
        }
    },
    Mutation: {
        updatePermission: (root, args, context) => {
            return updatePermissions(args.input);
        },
        updateSlot: (root, args, context) => {
            return updateSlot();
        }
    },
    Subscription: {
        notifyPermissionUpdate: {
            subscribe: (root, args, context) => {
                return pubsub.asyncIterator('PERMISSIONS_LIST');
            }
        },
        notifySlotAvailability: {
            subscribe: (root, args, context) => {
                console.log("----------<>--------------");
                notifySlotAvailability(args);
                console.log(pubsub.asyncIterator('SESSION_LIST'))
                return pubsub.asyncIterator('SESSION_LIST');
            }
        }
    }
}

const server = new ApolloServer({
    typeDefs,
    resolvers
})

let permissions = [
    {
        name: 'permission1',
        availability: true
    },
    {
        name: 'permission2',
        availability: true
    }
];

async function fetchSlotAvailability(args) {
    console.log('Streaming slots....')
    try {
        const response = await axios.get(`https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByPin?pincode=758035&date=${args.date}`);
        if (!_.isEmpty(response.data.centers))
            console.log(response.data);
        let centers = _.get(response.data, 'centers', []);
        centers.forEach(c => {
            let sessionList = _.get(c, 'sessions', []);
            let center = _.get(c, 'name', '');
            if (!_.isEmpty(sessionList)) {
                let filteredArray = _.filter(sessionList, (i) => {
                    if (i.min_age_limit === 45) {
                        return true;
                    }
                })
                if (filteredArray.length > 0 && filteredArray[0].available_capacity_dose2 > 0) {
                    let capacity = filteredArray[0].available_capacity_dose2
                    sendSMS(capacity, center);
                    pubsub.publish(['SESSION_LIST'], { notifySlotAvailability: response.data });
                }
                return response.data;
            }
        })
    } catch (error) {
        console.log(error)
    }
    return {};
}
function notifyPermissionUpdate() {
    return pubsub.publish('PERMISSIONS_LIST', { notifyPermissionUpdate: permissions })
}
async function notifySlotAvailability(args) {
    try {

        let param = {
            date: _.get(args, 'date') ?? '29-06-2021'
        }
        setInterval(async function () {
            await fetchSlotAvailability(param)
        }, 100000)
        return
    } catch (error) {
        console.log(error);
    }

}
function sendSMS(capacity, center) {
    client.messages
        .create({
            body: `${center} have available capacity of ${capacity}, hurry booking now!!`,
            from: '+16124007329',
            to: '+917795704389'
        })
        .then(message => console.log(message.sid));

}
function updateSlot() {
    sampleNoti.centers[0].lat = Math.random() * 100;
    return 'success';
}
function updatePermissions(param) {
    const response = "success";
    permissions.forEach(p => {
        if (p.name === param.name) {
            p.availability = param.availability
        }
    });
    notifyPermissionUpdate();
    return response;
}

server.listen({ port: process.env.PORT || 8090 }).then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
});
