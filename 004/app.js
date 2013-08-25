var express = require('express');
var LeveldbStore = require('connect-leveldb')(express);
var nunjucks = require('nunjucks');
var http = require('http');
var path = require('path');
var level = require('level');
var app = express();
var user = require('./user');
var nun = new nunjucks.Environment(new nunjucks.FileSystemLoader('templates'));

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

// База для хранения пользовательских записей
var userDb = level('./db/user', { valueEncoding: 'json'});
var api = user(userDb);

nun.express(app);

app.set('port', process.env.PORT || 3000);
app.use(express.favicon());

if ('development' == app.get('env')) {
    app.use(express.logger('dev'));
}

app.use(express.bodyParser());
app.use(express.cookieParser('anotheronebitesthedust'));
app.use(express.session({
    store: new LeveldbStore({
        dbLocation: "./db/sessions",
        ttl: 60 * 60 * 2
    }),
    secret: 'foobarbaz'
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'static')));

if ('development' == app.get('env')) {
    app.use(express.errorHandler());
}

// Настройка стратегий авторизации

passport.serializeUser(api.serializeUser);
passport.deserializeUser(api.deserializeUser);

passport.use(new LocalStrategy(function (username, password, callback) {
    console.log('password auth', {username: username, password: password});
    var profile = {
        provider: 'local',
        id: username
    };
    var userId = 'local:' + username;
    api.getUser(userId, function (error, user) {
        if (error) {
            if (error.name == 'NotFoundError') {
                callback(null, false, {message: 'Incorrect username'});
            } else {
                callback(error);
            }
        } else {
            if (user) {
                // Пользователь найден, далее проверяем пароль
                var passwordIsCorrect = api.checkPassword(user, password);
                if (passwordIsCorrect) {
                    callback(null, user);
                } else {
                    callback(null, false, { message: 'Incorrect password'});
                }
            } else {
                callback(null, false, {message: 'Incorrect username'});
            }
        }

    })
}));

// Хэндлеры путей
app.get('/', function (req, res) {
    res.render(!!req.user ? "user.html" : "guest.html", { myuser: req.user });
});

app.get('/register', function (req, res) {
    res.render("registration.html", { regMode: true });
});

app.post('/auth/register', function (req, res) {
    console.log('new user registers', req.body);
    req.body.provider = 'local';
    req.body.id = req.body.login;
    api.storeUser(req.body, function (error, user) {
        if (error) {
            res.send(500, 'Error registering user');
        } else {
            res.redirect('/');
        }
    });
});

app.post('/auth/login', passport.authenticate('local', { successRedirect: '/',
    failureRedirect: '/' }));

app.get('/auth/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});

http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});
