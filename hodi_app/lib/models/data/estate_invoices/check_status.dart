class CheckStatusResponse {
  final String status;
  final String message;

  CheckStatusResponse({required this.status, required this.message});

  factory CheckStatusResponse.fromJson(Map<String, dynamic> json) {
    return CheckStatusResponse(
      status: json['status'],
      message: json['message'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'status': status,
      'message': message,
    };
  }
}