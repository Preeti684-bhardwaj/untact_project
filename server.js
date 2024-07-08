require('dotenv').config()

const express = require('express');

let bodyParser = require('body-parser');

const jwt = require('jsonwebtoken');

const passport = require('passport');
const passportJWT = require('passport-jwt');

let ExtractJwt = passportJWT.ExtractJwt;
let JwtStrategy = passportJWT.Strategy;

let jwtOptions = {};
jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
jwtOptions.secretOrKey = process.env.JWT_SECRET;
jwtOptions.passReqToCallback= true;

const models = require('./models');
const db = models.db; 

let strategy = new JwtStrategy(jwtOptions, function(req,jwt_payload, done) {
  console.log('payload received', jwt_payload);
  var Model = jwt_payload.obj.type === 'AGENT' ? db.Agents : db.Admins;

   
  Model.findOne({where: {id: jwt_payload.obj.obj.id}})
	  .then( user =>{
        if (user) {
	   let obj ={
		   type:jwt_payload.obj.type,
		   obj:user
	   };
           return done(null,obj);
        } else {
            return done(null, false);
        }
    }).catch( error =>{
	    return done(null, false);
    });

});

// use the strategy
passport.use('jwt',strategy);


  
// force: true will drop the table if it already exists
db.sequelize.sync().then(() => {
 console.log('Drop and Resync with { force: true }');
}); 

let router = require('./routers/index.js');

const cors = require('cors')

let cluster = require('express-cluster');

cluster(function(worker) {
	const app = express();
	app.use(cors());

	app.use(bodyParser.json());
	app.use('/', router);
	app.use(passport.initialize());
	
	const server = app.listen(process.env.PORT || 18809, function () {
  		let host = server.address().address
  		let port = server.address().port
  		console.log("Workder listening at http://%s:%s", host, port); 
	})
}, {count: 4});

