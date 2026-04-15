module.exports = function() {
	return function(req, res, next) {
		res.setHeader("X-Bun-Validation-Middleware", "active");
		next();
	};
};
